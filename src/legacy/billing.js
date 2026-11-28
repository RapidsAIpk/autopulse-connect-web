// Billing screens.
//  • Settings → Billing (the dealer's owner, or an admin viewing a store): plan, paid-until, pay by card through
//    Stripe, "Manage card & invoices" (Stripe's own page), payments, cancel request.
//  • Settings → AutoPulse site → Billing (AutoPulse admins): connect Stripe with its keys, payment notices (webhook),
//    plans, cancel requests, stores with billing, copy from the old chatbot app, run the billing check.
//  • Stores → Actions → Billing & payments (AutoPulse admins): one store's billing — manual subscription, card
//    subscription (cancel / undo / change plan), record a payment, its payments and history.
//  • The "Not subscribed" screen: the owner can see the plans and pay there.
// Billing only turns each store's Subscribe switch on or off; every other screen keeps working as it does.
let ctx = null;

const STATUS_CLASS = { active: "known", trialing: "known", past_due: "tag-warn", unpaid: "tag-warn", incomplete: "tag-warn", canceled: "tag-warn", expired: "tag-warn", none: "tag-warn" };
const day = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");
const ymd = (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");
const enc = encodeURIComponent;

/**
 * Who sees the dealer's Billing tab: the store's owner account (Connect owner, CRM dealer), and an admin logged in as that
 * dealer. AutoPulse admins otherwise use Stores → Actions → Billing & payments.
 */
export function billingTabFor(me) {
  const kind = me?.user?.crmAccount || "";
  return kind === "owner" || kind === "dealer" || Boolean(me?.impersonatedBy);
}

export function initBilling(deps) {
  ctx = deps;
  const { $, h, state } = ctx;
  const tabs = $("settings-tabs");
  const grid = $("settings-grid");
  if (tabs && grid && !$("billing-panel")) {
    const tab = h("button", { type: "button", class: "seg-btn", "data-stab": "billing", role: "tab", text: "Billing" });
    const site = tabs.querySelector('[data-stab="site"]');
    tabs.insertBefore(tab, site || null);
    grid.append(h("div", { class: "panel pad billing-panel", id: "billing-panel", "data-stab": "billing", hidden: !deps.showDealerTab }, h("h3", { text: "Billing" }), h("div", { id: "billing-body", class: "stack" }, h("p", { class: "muted", text: "Loading…" }))));
    grid.append(h("div", { class: "panel pad admin-only billing-panel", id: "billing-admin-panel", "data-stab": "site", hidden: state.me?.role !== "admin" }, h("h3", { text: "Billing" }), h("div", { id: "billing-admin-body", class: "stack" }, h("p", { class: "muted", text: "Loading…" }))));
  }
  // After every other part of the app is set up (opening Settings shows Team, Pop-ups… which start after billing).
  setTimeout(() => handleReturn(), 0);
}

// ---------- coming back from Stripe ----------
/** "/#billing=done&session=cs_…" after paying; "#billing=cancelled" when the person went back; "#billing=back" from the card page. */
async function handleReturn() {
  const m = /^#billing=(done|cancelled|back)(?:&session=(cs_[A-Za-z0-9_]+))?$/.exec(location.hash);
  if (!m) return;
  const { api, toast } = ctx;
  history.replaceState(null, "", location.pathname);
  if (m[1] === "cancelled") toast("Payment not finished. Nothing was charged.", "info");
  if (m[1] === "done" && m[2]) {
    try {
      const r = await api("/api/billing/confirm", { method: "POST", body: { session: m[2] } });
      toast(r.done ? "Thank you! Your subscription is active." : "Payment received. It can take a minute to show here.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }
  ctx.openBillingTab?.();
}

/** Called when the app starts behind the "Not subscribed" screen: after paying, reload into the app. */
export async function handlePausedReturn({ api, toast }) {
  const m = /^#billing=(done|cancelled|back)(?:&session=(cs_[A-Za-z0-9_]+))?$/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, "", location.pathname);
  if (m[1] !== "done" || !m[2]) return false;
  try {
    const r = await api("/api/billing/confirm", { method: "POST", body: { session: m[2] } });
    if (r.done && r.billing?.access?.on) { location.reload(); return true; }
    toast("Payment received. It can take a minute to switch your account on. Reload the page in a moment.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
  return false;
}

// ---------- shared bits ----------
// "until 2026-12-04" → "until 4 Dec 2026" (the server keeps dates as YYYY-MM-DD).
const niceDates = (text) => String(text || "").replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => ymd(d));

function statusTag(b) {
  const { h } = ctx;
  const warn = b.status === "past_due" || b.cancelAtPeriodEnd || !b.access?.on;
  const text = b.access?.on ? (b.status === "trialing" ? "Free trial" : b.status === "past_due" ? "Payment failed" : b.cancelAtPeriodEnd ? "Ending" : "Active") : b.statusLabel || "Not subscribed";
  return h("span", { class: `tag ${warn ? "tag-warn" : STATUS_CLASS[b.status] || "known"}`, text, "data-tip": niceDates(b.access?.why) });
}

function summary(b, { admin = false } = {}) {
  const { h } = ctx;
  const rows = [];
  const kv = (k, v) => (v ? rows.push(h("div", { class: "kv" }, h("span", { class: "muted", text: k }), h("strong", { text: v }))) : null);
  kv("Status", niceDates(b.access?.why || b.statusLabel));
  kv("How", b.mode === "stripe" ? "Card (Stripe)" : b.mode === "manual" ? "Set by AutoPulse" : b.subscribed ? "Set by AutoPulse" : "");
  if (b.plan) kv("Plan", `${b.plan.name} · ${b.plan.price} ${b.plan.every}`);
  if (b.price && (!b.plan || b.priceCents !== b.plan.priceCents)) kv(b.plan ? "Price" : "Price", `${b.price} ${b.every}`);
  if (b.mode === "stripe") kv(b.cancelAtPeriodEnd ? "Ends on" : "Paid until", day(b.paidUntil));
  if (b.mode === "manual") kv("Paid until", b.endsOn ? ymd(b.endsOn) : "No end date");
  if (b.trialEndsOn) kv("Free trial until", ymd(b.trialEndsOn));
  if (admin && b.note) kv("Note", b.note);
  const alerts = [];
  if (b.status === "past_due") alerts.push(h("p", { class: "callout warn", text: admin ? "The last card payment failed. Stripe tries again; Connect stays on for 7 days, then switches off." : "Your last card payment failed. Update your card with \"Manage card & invoices\" within 7 days so your account stays on." }));
  if (b.mode === "stripe" && b.cancelAtPeriodEnd && b.status !== "canceled") alerts.push(h("p", { class: "callout", text: `This subscription ends on ${day(b.paidUntil)}. ${admin ? "Use \"Undo cancel\" to keep it." : "Ask AutoPulse if you want to keep it."}` }));
  return h("div", { class: "billing-summary" }, h("div", { class: "billing-head" }, statusTag(b)), h("div", { class: "billing-kv" }, ...rows), ...alerts);
}

function paymentsTable(payments, { admin = false, storeId = "", reload = null } = {}) {
  const { h, api, toast, confirmDialog } = ctx;
  if (!payments.length) return h("p", { class: "muted", text: "No payments yet." });
  return h("div", { class: "table-wrap" }, h("table", { class: "table records-table billing-table" },
    h("thead", {}, h("tr", {}, ...["Date", "Amount", "Period", "Details", ""].map((t) => h("th", { text: t })))),
    h("tbody", {}, ...payments.map((p) => h("tr", { class: p.status === "refunded" ? "is-void" : "" },
      h("td", { text: day(p.paidAt) }),
      h("td", {}, h("strong", { text: p.amount }), p.discount ? h("div", { class: "hint", text: `${p.discount} off${p.coupon ? ` (${p.coupon})` : ""}` }) : null),
      h("td", { class: "muted", text: p.periodStart ? `${day(p.periodStart)} – ${day(p.periodEnd)}` : "—" }),
      h("td", { class: "muted", text: p.status === "refunded" ? "Marked as not received" : p.source === "manual" ? p.description || "Recorded by AutoPulse" : p.invoiceNumber ? `Invoice ${p.invoiceNumber}` : "Card payment" }),
      h("td", {},
        p.invoiceUrl ? h("a", { class: "btn btn-sm", href: p.invoiceUrl, target: "_blank", rel: "noopener", text: "Invoice" }) : null,
        admin && p.source === "manual" && p.status !== "refunded" ? h("button", { type: "button", class: "btn btn-sm", text: "Not received", onclick: async () => {
          if (!(await confirmDialog({ title: "Mark as not received?", text: `${p.amount} on ${day(p.paidAt)} stays in the list, crossed out.`, okLabel: "Mark" }))) return;
          try { await api(`/api/admin/billing/stores/${enc(storeId)}/payments/${enc(p.id)}`, { method: "DELETE" }); toast("Marked", "success"); reload?.(); } catch (error) { toast(error.message, "error"); }
        } }) : null))))));
}

function field(label, input, hint) {
  const { h } = ctx;
  return h("label", { class: "field" }, h("span", {}, label), input, hint ? h("em", { class: "hint", text: hint }) : null);
}

function busy(button, on) {
  if (!button) return;
  button.disabled = on;
  button.classList.toggle("is-busy", on);
}

// ---------- dealer: Settings → Billing ----------
export async function loadBillingPanel() {
  const { $, h, api } = ctx;
  const panel = $("billing-panel");
  const body = $("billing-body");
  if (!panel || panel.hidden || !body) return;
  let data;
  try {
    data = await api("/api/billing");
  } catch (error) {
    body.replaceChildren(h("p", { class: "form-error", text: error.message }));
    return;
  }
  body.replaceChildren(...dealerBilling(data, { reload: loadBillingPanel }));
}

/** The dealer's billing (also used inside the "Not subscribed" screen). */
export function dealerBilling(data, { reload }) {
  const { h, api, toast } = ctx;
  const b = data.billing;
  const out = [];
  if (data.testMode) out.push(h("p", { class: "callout", text: "Test mode: no real money. Pay with card 4242 4242 4242 4242, any future date, any CVC and ZIP." }));
  out.push(summary(b));
  out.push(ctx.h("p", { class: "muted small" }, "Which features your dealership has, and anything AutoPulse switched off: ",
    ctx.h("button", { type: "button", class: "link-btn", text: "Subscription & features →", onclick: () => document.querySelector('#settings-tabs [data-stab="features"]')?.click() })));
  const onCard = b.mode === "stripe" && ["active", "trialing", "past_due"].includes(b.status);
  // Pay by card: plans to pick.
  if (!onCard) {
    if (!data.stripeReady || !data.plans.length) {
      out.push(h("p", { class: "muted", text: b.access?.on ? "Your subscription is managed by AutoPulse." : "Paying by card is not open yet. Please contact AutoPulse (contact@autopulse.ai) to subscribe." }));
    } else {
      out.push(h("h4", { class: "ai-channel-title", text: b.access?.on ? "Pay by card instead" : "Choose a plan" }));
      out.push(h("div", { class: "billing-plans" }, ...data.plans.map((p) => {
        const go = h("button", { type: "button", class: "btn btn-primary", text: p.trialDays ? `Start ${p.trialDays}-day free trial` : "Subscribe" });
        go.addEventListener("click", async () => {
          busy(go, true);
          try {
            const r = await api("/api/billing/checkout", { method: "POST", body: { planId: p.id } });
            location.assign(r.url); // Stripe's secure payment page
          } catch (error) {
            toast(error.message, "error");
            busy(go, false);
          }
        });
        return h("div", { class: "billing-plan" },
          h("strong", { class: "billing-plan-name", text: p.name }),
          h("div", { class: "billing-price" }, h("span", { text: p.price }), h("em", { text: ` ${p.every}` })),
          p.description ? h("p", { class: "muted", text: p.description }) : null,
          p.trialDays ? h("p", { class: "hint", text: `${p.trialDays} days free, then ${p.price} ${p.every}. Cancel by asking AutoPulse.` }) : null,
          go);
      })));
      out.push(h("p", { class: "hint", text: "You pay on Stripe's secure page; AutoPulse never sees your card. Have a discount code? Enter it there." }));
    }
  }
  // Card on file: Stripe's page for the card and invoices.
  if (b.hasCustomer && data.stripeReady) {
    const manage = h("button", { type: "button", class: "btn", text: "Manage card & invoices" });
    manage.addEventListener("click", async () => {
      busy(manage, true);
      try {
        const r = await api("/api/billing/portal", { method: "POST", body: {} });
        location.assign(r.url);
      } catch (error) {
        toast(error.message, "error");
        busy(manage, false);
      }
    });
    out.push(h("div", { class: "btn-row" }, manage, h("span", { class: "hint", text: "Change your card, download invoices and receipts." })));
  }
  // Payments.
  out.push(h("h4", { class: "ai-channel-title", text: "Payments" }), paymentsTable(data.payments));
  // Cancel request.
  if (data.cancelRequest) {
    out.push(h("div", { class: "callout" },
      h("span", { text: `You asked to cancel on ${day(data.cancelRequest.createdAt)}. AutoPulse will contact you. ` }),
      h("button", { type: "button", class: "btn btn-sm", text: "Withdraw my request", onclick: async () => {
        try { await api("/api/billing/cancel-request", { method: "DELETE" }); toast("Request withdrawn", "success"); reload(); } catch (error) { toast(error.message, "error"); }
      } })));
  } else if (b.access?.on || onCard) {
    const ask = h("button", { type: "button", class: "btn btn-danger-outline", text: "Request cancellation" });
    ask.addEventListener("click", () => cancelRequestDialog(reload));
    out.push(h("div", { class: "btn-row" }, ask, h("span", { class: "hint", text: "AutoPulse confirms with you first. Nothing stops until then." })));
    if (data.lastCancelRequest && data.lastCancelRequest.status === "rejected" && data.lastCancelRequest.answer) out.push(h("p", { class: "hint", text: `AutoPulse's answer to your last request: ${data.lastCancelRequest.answer}` }));
  }
  return out;
}

function cancelRequestDialog(reload) {
  const { h, api, toast } = ctx;
  const dialog = ensureDialog("billing-cancel-dialog");
  const reason = h("textarea", { name: "reason", rows: "3", maxlength: "1000", placeholder: "Why are you leaving? (optional)" });
  const send = h("button", { type: "submit", class: "btn btn-primary", text: "Send request" });
  const form = h("form", { id: "billing-cancel-form", class: "stack", method: "dialog", novalidate: true },
    h("h3", { text: "Request cancellation" }),
    h("p", { class: "muted", text: "AutoPulse will contact you to confirm. Your account keeps working until then; a card subscription runs to the end of the paid period." }),
    field("Reason", reason),
    h("div", { class: "dialog-actions" }, h("button", { type: "button", class: "btn", text: "Keep my subscription", onclick: () => dialog.close() }), send));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(send, true);
    try {
      await api("/api/billing/cancel-request", { method: "POST", body: { reason: reason.value } });
      dialog.close();
      toast("Request sent to AutoPulse", "success");
      reload();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      busy(send, false);
    }
  });
  dialog.replaceChildren(form);
  dialog.showModal();
}

function ensureDialog(id) {
  const { h } = ctx;
  let dialog = document.getElementById(id);
  if (!dialog) {
    dialog = h("dialog", { id, class: "dialog billing-dialog" });
    document.body.append(dialog);
  }
  return dialog;
}

// ---------- "Not subscribed" screen ----------
/** Plans and payment inside the "Not subscribed" card, for the store's owner. */
export async function paintPausedBilling(container, deps) {
  ctx = ctx || deps;
  const { h, api } = deps;
  const load = async () => {
    let data;
    try {
      data = await api("/api/billing");
    } catch (error) {
      container.replaceChildren(h("p", { class: "form-error", text: error.message }));
      return;
    }
    container.replaceChildren(...dealerBilling(data, { reload: load }));
  };
  container.replaceChildren(h("p", { class: "muted", text: "Loading plans…" }));
  await load();
}

// ---------- admin: Settings → AutoPulse site → Billing ----------
export async function loadBillingAdmin() {
  const { $, h, api } = ctx;
  const panel = $("billing-admin-panel");
  const body = $("billing-admin-body");
  if (!panel || panel.hidden || !body) return;
  let data;
  try {
    data = await api("/api/admin/billing");
  } catch (error) {
    body.replaceChildren(h("p", { class: "form-error", text: error.message }));
    return;
  }
  body.replaceChildren(
    h("p", { class: "muted", text: "Card payments go through Stripe. Billing only turns each store's Subscribe switch on or off: paid or within a set date = on." }),
    stripeSection(data.stripe),
    plansSection(data.plans, data.stripe),
    requestsSection(data.cancelRequests),
    storesSection(data.stores),
    toolsSection(data),
  );
}

function stripeSection(s) {
  const { h, api, toast, confirmDialog } = ctx;
  const box = h("div", { class: "stack billing-block" }, h("h4", { class: "ai-channel-title", text: "1. Stripe connection" }));
  box.append(h("div", { class: "billing-kv" },
    h("div", { class: "kv" }, h("span", { class: "muted", text: "Stripe" }), h("span", { class: `tag ${s.connected ? "known" : "tag-warn"}`, text: s.connected ? `Connected · ${s.mode === "live" ? "LIVE (real money)" : "test mode"}` : "Not connected" })),
    s.connected ? h("div", { class: "kv" }, h("span", { class: "muted", text: "Key" }), h("strong", { text: `…${s.keyEnding}${s.accountName ? ` · ${s.accountName}` : ""}${s.fromEnv ? " (server setting)" : ""}` })) : null,
    h("div", { class: "kv" }, h("span", { class: "muted", text: "Payment notices" }), h("span", { class: `tag ${s.webhook.ready ? "known" : "tag-warn"}`, text: s.webhook.ready ? "On" : "Off", "data-tip": s.webhook.url }))));
  if (!s.fromEnv) {
    const secret = h("input", { name: "secretKey", type: "password", autocomplete: "off", spellcheck: "false", placeholder: s.connected ? "Paste a new key to replace it" : "sk_test_… or sk_live_…" });
    const pub = h("input", { name: "publishableKey", autocomplete: "off", spellcheck: "false", placeholder: "pk_test_… (optional)", value: s.publishableKey || "" });
    const save = h("button", { type: "submit", class: "btn btn-primary", text: s.connected ? "Replace keys" : "Connect Stripe" });
    const form = h("form", { id: "billing-stripe-form", class: "stack", novalidate: true },
      h("div", { class: "address-grid" }, field("Secret key", secret, "Stripe → Developers → API keys. Kept encrypted; never shown again."), field("Publishable key", pub)),
      h("div", { class: "btn-row" }, save, s.connected ? h("button", { type: "button", class: "btn", text: "Remove keys", onclick: async () => {
        if (!(await confirmDialog({ title: "Remove the Stripe keys?", text: "Dealers can't pay by card until keys are saved again. Subscriptions already paid stay as they are.", okLabel: "Remove" }))) return;
        try { await api("/api/admin/billing/stripe", { method: "DELETE" }); toast("Keys removed", "success"); loadBillingAdmin(); } catch (error) { toast(error.message, "error"); }
      } }) : null));
    if (!s.canSave) box.append(h("p", { class: "callout warn", text: "This server cannot store keys safely yet (PAGE_TOKEN_KEY is not set). Set the keys on the server instead." }));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      busy(save, true);
      try {
        const r = await api("/api/admin/billing/stripe", { method: "POST", body: { secretKey: secret.value.trim(), publishableKey: pub.value.trim() } });
        toast(`Stripe connected (${r.mode} mode)`, "success");
        loadBillingAdmin();
      } catch (error) {
        toast(error.message, "error");
      } finally {
        busy(save, false);
      }
    });
    box.append(form);
  }
  if (s.connected && !s.webhook.fromEnv) {
    const hook = h("button", { type: "button", class: "btn", text: s.webhook.ready ? "Set up payment notices again" : "Turn on payment notices" });
    hook.addEventListener("click", async () => {
      busy(hook, true);
      try { await api("/api/admin/billing/webhook", { method: "POST", body: {} }); toast("Payment notices are on", "success"); loadBillingAdmin(); } catch (error) { toast(error.message, "error"); busy(hook, false); }
    });
    box.append(h("div", { class: "btn-row" }, hook, h("span", { class: "hint", text: `Stripe tells Connect about renewals, failed cards and cancellations at ${s.webhook.url}. Without it Connect still checks Stripe every 15 minutes.` })));
  }
  return box;
}

function planForm(plan, onDone) {
  const { h, api, toast } = ctx;
  const name = h("input", { name: "name", maxlength: "60", value: plan?.name || "", placeholder: "Chatbot" });
  const description = h("input", { name: "description", maxlength: "500", value: plan?.description || "", placeholder: "Website chat, Inbox, leads…" });
  const price = h("input", { name: "price", inputmode: "decimal", value: plan ? String(plan.priceCents / 100) : "", placeholder: "600" });
  const interval = h("select", { name: "interval" }, ...[["month", "Monthly"], ["year", "Yearly"], ["week", "Weekly"]].map(([v, t]) => h("option", { value: v, text: t, selected: (plan?.interval || "month") === v })));
  const intervalCount = h("input", { name: "intervalCount", inputmode: "numeric", value: String(plan?.intervalCount || 1) });
  const trialDays = h("input", { name: "trialDays", inputmode: "numeric", value: String(plan?.trialDays || 0) });
  const save = h("button", { type: "submit", class: "btn btn-primary", text: plan ? "Save plan" : "Add plan" });
  const form = h("form", { id: "billing-plan-form", class: "stack", novalidate: true },
    h("div", { class: "address-grid" },
      field("Plan name", name), field("Price (USD)", price, plan ? "A new price applies to new subscriptions; stores already paying keep theirs." : ""),
      field("Billed", interval), field("Every", intervalCount, "1 = every month / year"),
      field("Free trial (days)", trialDays, "0 = none. Only a store's first subscription gets it."), field("What it includes", description)),
    h("div", { class: "btn-row" }, save, plan ? h("button", { type: "button", class: "btn", text: "Close", onclick: () => onDone(false) }) : null));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(save, true);
    const body = { name: name.value.trim(), description: description.value.trim(), price: price.value.trim(), interval: interval.value, intervalCount: intervalCount.value.trim() || "1", trialDays: trialDays.value.trim() || "0" };
    try {
      await api(plan ? `/api/admin/billing/plans/${plan.id}` : "/api/admin/billing/plans", { method: plan ? "PATCH" : "POST", body });
      toast(plan ? "Plan saved" : "Plan added", "success");
      onDone(true);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      busy(save, false);
    }
  });
  return form;
}

function plansSection(plans, stripe) {
  const { h, api, toast } = ctx;
  const box = h("div", { class: "stack billing-block" }, h("h4", { class: "ai-channel-title", text: "2. Plans" }));
  const current = stripe.mode;
  if (plans.length) {
    const editSlot = h("div");
    box.append(h("div", { class: "table-wrap" }, h("table", { class: "table records-table billing-table" },
      h("thead", {}, h("tr", {}, ...["Plan", "Price", "Free trial", "Stripe", "Shown", ""].map((t) => h("th", { text: t })))),
      h("tbody", {}, ...plans.map((p) => h("tr", {},
        h("td", {}, h("strong", { text: p.name }), p.description ? h("div", { class: "hint", text: p.description }) : null),
        h("td", { text: `${p.price} ${p.every}` }),
        h("td", { text: p.trialDays ? `${p.trialDays} days` : "—" }),
        h("td", {}, h("span", { class: `tag ${p.mode === current ? "known" : "tag-warn"}`, text: p.mode === "live" ? "Live" : "Test", "data-tip": p.mode === current ? "Made in the Stripe mode in use now" : "Made in the other Stripe mode: dealers don't see it now" })),
        h("td", { text: p.active && p.mode === current ? "Yes" : "No", "data-tip": "Shown to dealers on their Billing tab" }),
        h("td", {},
          h("button", { type: "button", class: "btn btn-sm", text: "Edit", onclick: () => editSlot.replaceChildren(h("h4", { class: "ai-channel-title", text: `Edit ${p.name}` }), planForm(p, (changed) => { editSlot.replaceChildren(); if (changed) loadBillingAdmin(); })) }),
          h("button", { type: "button", class: "btn btn-sm", text: p.active ? "Hide" : "Show", onclick: async () => {
            try { await api(`/api/admin/billing/plans/${p.id}`, p.active ? { method: "DELETE" } : { method: "PATCH", body: { active: true } }); toast(p.active ? "Plan hidden from dealers" : "Plan shown to dealers", "success"); loadBillingAdmin(); } catch (error) { toast(error.message, "error"); }
          } }))))))), editSlot);
  } else {
    box.append(h("p", { class: "muted", text: stripe.connected ? "No plans yet. Add one below, or copy the old chatbot app's plan (5. Tools)." : "Connect Stripe first, then add plans." }));
  }
  if (stripe.connected) box.append(h("details", { class: "billing-add" }, h("summary", { class: "btn btn-sm", text: "Add a plan" }), planForm(null, () => loadBillingAdmin())));
  return box;
}

function requestsSection(requests) {
  const { h } = ctx;
  const box = h("div", { class: "stack billing-block" }, h("h4", { class: "ai-channel-title", text: `3. Cancel requests${requests.length ? ` (${requests.length})` : ""}` }));
  if (!requests.length) {
    box.append(h("p", { class: "muted", text: "No open requests." }));
    return box;
  }
  box.append(...requests.map((r) => requestRow(r, loadBillingAdmin)));
  return box;
}

function requestRow(r, reload) {
  const { h, api, toast, confirmDialog } = ctx;
  const decide = async (decision, when) => {
    const answer = decision === "reject" ? await confirmDialog({ title: "Keep the subscription?", text: "Optional: a short answer the dealer sees on their Billing tab.", okLabel: "Reject request", input: true, inputType: "text", placeholder: "We called you on…" }) : true;
    if (answer === null) return;
    if (decision === "approve" && !(await confirmDialog({ title: when === "now" ? "Cancel now?" : "Cancel at the end of the paid period?", text: when === "now" ? "Connect switches off for this store now. A card subscription is cancelled in Stripe at once (no refund is made automatically)." : "Connect stays on until the paid period ends, then switches off.", okLabel: "Approve" }))) return;
    try {
      await api(`/api/admin/billing/cancel-requests/${r.id}`, { method: "POST", body: { decision, when, answer: typeof answer === "string" ? answer : "" } });
      toast(decision === "approve" ? "Cancellation approved" : "Request rejected", "success");
      reload();
    } catch (error) {
      toast(error.message, "error");
    }
  };
  return h("div", { class: "billing-request" },
    h("div", {}, h("strong", { text: r.storeName || r.storeId }), h("span", { class: "muted", text: ` · ${r.website || ""} · asked ${day(r.createdAt)}` }), r.reason ? h("p", { class: "hint", text: `“${r.reason}”` }) : null),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn btn-sm", text: "Approve (end of period)", onclick: () => decide("approve", "period_end") }),
      h("button", { type: "button", class: "btn btn-sm btn-danger-outline", text: "Approve now", onclick: () => decide("approve", "now") }),
      h("button", { type: "button", class: "btn btn-sm", text: "Reject", onclick: () => decide("reject", "period_end") })));
}

function storesSection(stores) {
  const { h } = ctx;
  const box = h("div", { class: "stack billing-block" }, h("h4", { class: "ai-channel-title", text: "4. Stores with billing" }));
  if (!stores.length) {
    box.append(h("p", { class: "muted", text: "None yet. Stores subscribed with the Stores page toggle (no billing) keep working as they are. Set one up in Stores → Actions → Billing & payments." }));
    return box;
  }
  box.append(h("div", { class: "table-wrap" }, h("table", { class: "table records-table billing-table" },
    h("thead", {}, h("tr", {}, ...["Store", "Status", "How", "Price", "Until", ""].map((t) => h("th", { text: t })))),
    h("tbody", {}, ...stores.map((b) => h("tr", {},
      h("td", {}, h("strong", { text: b.name }), h("div", { class: "hint", text: b.website || b.storeId })),
      h("td", {}, statusTag(b)),
      h("td", { text: b.mode === "stripe" ? "Card" : b.mode === "manual" ? "Manual" : "—" }),
      h("td", { text: b.price ? `${b.price} ${b.every}` : "—" }),
      h("td", { text: b.mode === "stripe" ? day(b.paidUntil) || "—" : b.endsOn ? ymd(b.endsOn) : b.trialEndsOn ? `Trial ${ymd(b.trialEndsOn)}` : "No end date" }),
      h("td", {}, b.missing ? h("span", { class: "hint", text: "Store removed" }) : h("button", { type: "button", class: "btn btn-sm", text: "Open", onclick: () => openStoreBilling({ id: b.storeId, name: b.name }) }))))))));
  return box;
}

function toolsSection(data) {
  const { h, api, toast, confirmDialog } = ctx;
  const box = h("div", { class: "stack billing-block" }, h("h4", { class: "ai-channel-title", text: "5. Tools" }));
  const out = h("div", { class: "stack" });
  const report = (r) => {
    const list = (title, rows, line) => (rows.length ? [h("strong", { text: title }), h("ul", {}, ...rows.map((x) => h("li", { text: line(x) })))] : []);
    out.replaceChildren(
      h("p", { class: "callout", text: r.dryRun ? "Preview only: nothing was copied yet." : "Copied." }),
      ...list("Plans", r.plans, (p) => `${p.name}: ${p.price} ${p.every} (${p.stripe})`),
      ...list("Stores", r.stores, (s) => `${s.store} (${s.website || s.storeId}): ${s.price}, paid until ${s.paidUntil}${s.trialUntil ? `, trial until ${s.trialUntil}` : ""} · Connect ${s.connectNow} · ${s.note}`),
      ...list("Skipped", r.skipped, (s) => `${s.what}: ${s.why}`),
      r.note ? h("p", { class: "hint", text: r.note }) : null,
      r.dryRun && (r.plans.length || r.stores.length) ? h("button", { type: "button", class: "btn btn-primary", text: "Copy now", onclick: async () => {
        if (!(await confirmDialog({ title: "Copy from the old chatbot app?", text: `${r.plans.length} plan(s) and ${r.stores.length} store(s). The stores become manual subscriptions with the same price and end date, and Connect turns on for them.`, okLabel: "Copy" }))) return;
        try { report(await api("/api/admin/billing/import", { method: "POST", body: { dryRun: false } })); loadBillingAdmin(); } catch (error) { toast(error.message, "error"); }
      } }) : null);
  };
  const preview = h("button", { type: "button", class: "btn", text: "Copy from the old chatbot app…", disabled: !data.laravel, "data-tip": data.laravel ? "Shows what would be copied first" : "The old chatbot app's database is not connected here" });
  preview.addEventListener("click", async () => {
    busy(preview, true);
    try { report(await api("/api/admin/billing/import", { method: "POST", body: { dryRun: true } })); } catch (error) { toast(error.message, "error"); } finally { busy(preview, false); }
  });
  const check = h("button", { type: "button", class: "btn", text: "Run the billing check now" });
  check.addEventListener("click", async () => {
    busy(check, true);
    try { const r = await api("/api/admin/billing/check", { method: "POST", body: {} }); toast(`Checked ${r.checked} store(s): ${r.changed} switched, ${r.refreshed} re-read from Stripe`, "success"); loadBillingAdmin(); } catch (error) { toast(error.message, "error"); } finally { busy(check, false); }
  });
  box.append(h("div", { class: "btn-row" }, preview, check), h("p", { class: "hint", text: "The check runs by itself every 15 minutes: end dates and trials that passed switch stores off; card renewals are read from Stripe." }), out);
  return box;
}

// ---------- admin: one store (Stores → Actions → Billing & payments) ----------
export async function openStoreBilling(s) {
  const { h, api, toast, confirmDialog } = ctx;
  const dialog = ensureDialog("store-billing-dialog");
  const paint = async () => {
    let data;
    try {
      data = await api(`/api/admin/billing/stores/${enc(s.id)}`);
    } catch (error) {
      toast(error.message, "error");
      return;
    }
    const b = data.billing;
    const act = (label, cls, fn) => {
      const btn = h("button", { type: "button", class: `btn btn-sm ${cls || ""}`, text: label });
      btn.addEventListener("click", async () => {
        busy(btn, true);
        try { await fn(); await paint(); } catch (error) { toast(error.message, "error"); } finally { busy(btn, false); }
      });
      return btn;
    };
    const post = (path, body = {}) => api(`/api/admin/billing/stores/${enc(s.id)}${path}`, { method: "POST", body });
    const parts = [h("h3", { text: `Billing: ${data.store.name}` }), h("p", { class: "muted", text: `${data.store.website || data.store.id} · ${data.store.kindLabel || data.store.kind}` }), summary(b, { admin: true })];

    // Card subscription.
    if (b.mode === "stripe" && b.status !== "canceled") {
      const planPick = h("select", { name: "planId" }, h("option", { value: "", text: "Change plan to…" }), ...data.plans.filter((p) => p.active && p.mode === data.stripe.mode && p.id !== b.plan?.id).map((p) => h("option", { value: String(p.id), text: `${p.name} · ${p.price} ${p.every}` })));
      parts.push(h("h4", { class: "ai-channel-title", text: "Card subscription" }), h("div", { class: "btn-row" },
        act("Refresh from Stripe", "", () => post("/refresh")),
        b.cancelAtPeriodEnd
          ? act("Undo cancel", "", () => post("/resume"))
          : act("Cancel at period end", "", async () => { if (await confirmDialog({ title: "Cancel at the end of the paid period?", text: `Connect stays on until ${day(b.paidUntil)}, then switches off. No more charges.`, okLabel: "Cancel at period end" })) await post("/cancel", { when: "period_end" }); }),
        act("Cancel now", "btn-danger-outline", async () => { if (await confirmDialog({ title: "Cancel now?", text: "Connect switches off for this store now and Stripe stops charging. No refund is made automatically.", okLabel: "Cancel now" })) await post("/cancel", { when: "now" }); }),
        planPick,
        act("Change plan", "", async () => { if (!planPick.value) throw new Error("Pick a plan first"); if (await confirmDialog({ title: "Change the plan?", text: "Stripe charges or credits the difference on the next invoice.", okLabel: "Change plan" })) await post("/plan", { planId: Number(planPick.value) }); })));
    } else if (b.mode === "stripe") {
      parts.push(h("div", { class: "btn-row" }, act("Refresh from Stripe", "", () => post("/refresh"))));
    }

    // Manual subscription.
    const cardPaid = b.mode === "stripe" && ["active", "trialing", "past_due"].includes(b.status);
    if (!cardPaid) {
      const price = h("input", { name: "price", inputmode: "decimal", value: b.mode === "manual" && b.priceCents != null ? String(b.priceCents / 100) : "", placeholder: "600" });
      const interval = h("select", { name: "interval" }, ...[["month", "per month"], ["year", "per year"]].map(([v, t]) => h("option", { value: v, text: t })));
      const endsOn = h("input", { name: "endsOn", type: "date", value: b.mode === "manual" ? b.endsOn || "" : "" });
      const trialEndsOn = h("input", { name: "trialEndsOn", type: "date", value: b.trialEndsOn || "" });
      const plan = h("select", { name: "planId" }, h("option", { value: "", text: "No plan" }), ...data.plans.map((p) => h("option", { value: String(p.id), text: `${p.name} · ${p.price} ${p.every}`, selected: b.plan?.id === p.id })));
      const note = h("input", { name: "note", maxlength: "500", value: b.mode === "manual" ? b.note || "" : "", placeholder: "Paid by cheque, invoice #…" });
      const save = h("button", { type: "submit", class: "btn btn-primary", text: b.mode === "manual" && b.status !== "canceled" ? "Save manual subscription" : "Subscribe by hand" });
      const form = h("form", { id: "billing-manual-form", class: "stack", novalidate: true },
        h("p", { class: "hint", text: "For dealers who pay outside Stripe. Connect is on until the \"Paid until\" date (no date = until you end it). A free trial alone also turns it on until that date." }),
        h("div", { class: "address-grid" }, field("Price (USD)", price, "What they pay; for your records"), field("Billed", interval), field("Paid until", endsOn, "Last day with access (New York time)"), field("Free trial until", trialEndsOn), field("Plan", plan), field("Note", note)),
        h("div", { class: "btn-row" }, save, b.mode === "manual" && b.status !== "canceled" ? act("End now", "btn-danger-outline", async () => { if (await confirmDialog({ title: "End the manual subscription now?", text: "Connect switches off for this store now.", okLabel: "End now" })) await post("/manual/end"); }) : null));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        busy(save, true);
        try {
          const r = await post("/manual", { price: price.value.trim(), interval: interval.value, endsOn: endsOn.value, trialEndsOn: trialEndsOn.value, planId: plan.value ? Number(plan.value) : null, note: note.value.trim() });
          toast(r.switch?.on ? "Saved · Connect is on for this store" : "Saved · Connect is off for this store", "success");
          await paint();
        } catch (error) {
          toast(error.message, "error");
        } finally {
          busy(save, false);
        }
      });
      parts.push(h("h4", { class: "ai-channel-title", text: "Manual subscription" }), form);
    }

    // Record a payment received outside Stripe.
    const amount = h("input", { name: "amount", inputmode: "decimal", placeholder: "600" });
    const paidOn = h("input", { name: "paidOn", type: "date", value: data.today });
    const pnote = h("input", { name: "note", maxlength: "200", placeholder: "Cheque #1042" });
    const rec = h("button", { type: "submit", class: "btn", text: "Record payment" });
    const payForm = h("form", { id: "billing-payment-form", class: "stack", novalidate: true },
      h("div", { class: "address-grid" }, field("Amount (USD)", amount), field("Paid on", paidOn), field("Note", pnote)),
      h("div", { class: "btn-row" }, rec, h("span", { class: "hint", text: "For your records only: it does not change access. Set \"Paid until\" above for that." })));
    payForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      busy(rec, true);
      try { await post("/payments", { amount: amount.value.trim(), paidOn: paidOn.value, note: pnote.value.trim() }); toast("Payment recorded", "success"); await paint(); } catch (error) { toast(error.message, "error"); } finally { busy(rec, false); }
    });
    parts.push(h("details", { class: "billing-add" }, h("summary", { class: "btn btn-sm", text: "Record a payment received" }), payForm));

    parts.push(h("h4", { class: "ai-channel-title", text: "Payments" }), paymentsTable(data.payments, { admin: true, storeId: s.id, reload: paint }));
    const open = data.cancelRequests.filter((r) => r.status === "pending");
    if (open.length) parts.push(h("h4", { class: "ai-channel-title", text: "Cancel request" }), ...open.map((r) => requestRow({ ...r, storeName: data.store.name, website: data.store.website }, paint)));
    if (b.history.length) parts.push(h("details", {}, h("summary", { class: "muted", text: "History" }), h("ul", { class: "billing-history" }, ...b.history.map((x) => h("li", { text: `${day(x.at)} · ${x.what}` })))));
    parts.push(h("div", { class: "dialog-actions" }, h("button", { type: "button", class: "btn", text: "Close", onclick: () => dialog.close() })));
    dialog.replaceChildren(h("div", { class: "stack" }, ...parts));
    if (!dialog.open) dialog.showModal();
  };
  dialog.addEventListener("close", () => ctx.onStoreBillingClosed?.(), { once: true });
  await paint();
}
