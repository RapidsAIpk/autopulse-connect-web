// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/stores.js — edit the port script, not this file.
import { legacyFetch } from "@/lib/legacyFetch";
// AutoPulse admin screens: Stores (list, filters, CSV, import, add, password, delete, log in as dealer),
// the "Back to admin" banner, the outside-services log (Activity) and global settings (Settings → AutoPulse site).
let ctx = null;
const t = { page: 1, perPage: 25, filters: {} };
const out = { page: 1, perPage: 50 };

// Dealer types: a Connect dealer, or a CRM dealer that is "CRM only" until we turn Connect on ("CRM & Connect").
const TYPE_CLASS = { connect: "src-twilio", crm_connect: "src-website", crm_only: "src-sms" };
const TYPE_TIP = {
  connect: "Lives only in AutoPulse Connect. Its owner and team sign in here.",
  crm_connect: "An AutoPulse CRM dealer that also uses Connect. Its staff sign in with their CRM login.",
  crm_only: "An AutoPulse CRM dealer that isn't subscribed to Connect. Its staff can't sign in here; you can still open it. Subscribe it in Actions.",
};

export function initStores(deps) {
  ctx = deps;
  const { $ } = ctx;
  const form = $("stores-filters");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    t.filters = Object.fromEntries([...new FormData(form)].filter(([, v]) => v));
    t.page = 1;
    loadStores();
  });
  form?.querySelector("[data-reset]")?.addEventListener("click", () => {
    form.reset();
    t.filters = {};
    t.page = 1;
    loadStores();
  });
  $("stores-per-page")?.addEventListener("change", (e) => { t.perPage = Number(e.target.value); t.page = 1; loadStores(); });
  const paintAccess = () => { $("store-add-password-field").hidden = $("store-add-access").value !== "temp"; };
  $("store-add-access")?.addEventListener("change", paintAccess);
  $("stores-add-btn")?.addEventListener("click", () => { $("store-add-form").reset(); paintAccess(); showErr("store-add-error", ""); $("store-add-dialog").showModal(); });
  $("store-add-cancel")?.addEventListener("click", () => $("store-add-dialog").close());
  $("store-add-form")?.addEventListener("submit", addStore);
  $("stores-import-file")?.addEventListener("change", importCsv);
  $("impersonation-return")?.addEventListener("click", backToAdmin);
  $("out-service")?.addEventListener("change", () => { out.page = 1; loadOutbound(); });
  $("out-failed")?.addEventListener("change", () => { out.page = 1; loadOutbound(); });
  $("site-form")?.addEventListener("submit", saveSite);
  $("site-logo-light-input")?.addEventListener("change", (e) => uploadLogo(e, "light"));
  $("site-logo-dark-input")?.addEventListener("change", (e) => uploadLogo(e, "dark"));
}

function showErr(id, message) {
  const node = ctx.$(id);
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
}

const query = (extra = {}) => new URLSearchParams(Object.entries({ ...t.filters, page: t.page, perPage: t.perPage, ...extra }).filter(([, v]) => v !== "" && v != null)).toString();

function pager(node, page, perPage, total, go) {
  const { h } = ctx;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const nums = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p += 1) nums.push(p);
  node.replaceChildren(
    h("button", { type: "button", class: "btn btn-sm", disabled: page <= 1, onclick: () => go(page - 1), "aria-label": "Previous page" }, "←"),
    ...nums.map((p) => h("button", { type: "button", class: `btn btn-sm${p === page ? " btn-primary" : ""}`, onclick: () => go(p) }, String(p))),
    h("button", { type: "button", class: "btn btn-sm", disabled: page >= pages, onclick: () => go(page + 1), "aria-label": "Next page" }, "→"),
  );
}

// ---------- Stores ----------

export async function loadStores() {
  const { $, h, api, toast } = ctx;
  let data;
  try {
    data = await api(`/api/admin/stores?${query()}`);
  } catch (error) {
    toast(error.message, "error");
    return;
  }
  $("stores-csv").href = `/api/admin/stores/export?${query({ page: "", perPage: "" })}`;
  const body = $("stores-body");
  body.replaceChildren(...(data.items.length ? data.items.map((s) => h("tr", {},
    h("td", {}, h("strong", { text: s.name || "—" }), controlBadges(s)),
    h("td", { class: "muted", text: s.website || "—" }),
    h("td", {}, h("span", { class: `source-tag ${TYPE_CLASS[s.type] || ""}`, text: s.kindLabel, "data-tip": TYPE_TIP[s.type] || "" }),
      s.test ? h("span", { class: "source-tag src-demo type-test", text: "Test", "data-tip": "A store for testing. Real dealers never get its e-mails. It can't be deleted." }) : null),
    h("td", { text: s.contactName || "—" }),
    h("td", {}, s.email ? h("a", { href: `mailto:${s.email}`, text: s.email }) : "—"),
    h("td", { text: s.phone || "—" }),
    h("td", {}, h("span", {
      class: `tag ${s.subscribed ? "known" : "tag-warn"}`,
      text: s.subscribed ? "Subscribed" : "Unsubscribed",
      "data-tip": s.subscribed
        ? `Can use AutoPulse Connect${s.subscription?.since ? ` · since ${new Date(s.subscription.since).toLocaleDateString()}` : ""}`
        : "Can't use AutoPulse Connect: no sign-in for the dealer's team, website chat off. Subscribe in Actions.",
    })),
    h("td", { text: String(s.leads) }),
    h("td", {}, actionsFor(s)),
  )) : [h("tr", {}, h("td", { colspan: "9", class: "muted records-empty", text: "No stores match these filters." }))]));
  const from = data.total ? (data.page - 1) * data.perPage + 1 : 0;
  $("stores-count").textContent = data.total ? `Showing ${from} to ${Math.min(data.page * data.perPage, data.total)} of ${data.total} stores` : "No stores";
  pager($("stores-pager"), data.page, data.perPage, data.total, (p) => { t.page = p; loadStores(); });
}

/**
 * The same Actions menu on every store. What a store cannot do is greyed out, and hovering it says why.
 * (A native <select> cannot show a reason on one option, so this is a small menu of buttons.)
 */
function storeActions(s) {
  // Same rules as the server. Unsubscribed stores: admins can still open them and log in as them; the dealer can't.
  const crm = s.kind === "crm", hasOwner = Boolean(s.owner);
  const ownerOff = s.owner?.disabled ? "This dealer account is turned off, so no one can sign in as them." : "";
  const noAccount = "No one signs in to this store: it has no owner account. Use 'Open store in new tab'.";
  return [
    { key: "open", label: "Open store in new tab" },
    { key: "details", label: "Edit store details" },
    { key: "controls", label: "Store controls (switch chat, AI, sign-in, tracking)", off: s.website ? "" : "Add the store's website first (Edit store details)." },
    s.subscribed
      ? { key: "unsubscribe", label: "Unsubscribe (can't use Connect)", danger: true }
      : { key: "subscribe", label: "Subscribe (can use Connect)" },
    { key: "login", label: "Log in as dealer", off: crm ? "" : !hasOwner ? noAccount : ownerOff },
    { key: "password", label: "Change password", off: crm ? "AutoPulse CRM dealers change their password in AutoPulse CRM." : hasOwner ? "" : noAccount },
    { key: "delete", label: "Delete store", danger: true, off: crm ? "AutoPulse CRM dealers are removed in AutoPulse CRM. Use Store controls to pause sign-in or chat." : s.test ? "Test stores are kept for testing and cannot be deleted." : "" },
  ];
}

async function setSubscribed(s, on) {
  const { api, toast, confirmDialog } = ctx;
  const crm = s.kind === "crm";
  const ok = await confirmDialog(on
    ? { title: `Subscribe ${s.name}?`, text: `It can use AutoPulse Connect: ${crm ? "its staff sign in with their AutoPulse CRM login" : "its owner and team can sign in"}, and its website chat works.`, okLabel: "Subscribe" }
    : { title: `Unsubscribe ${s.name}?`, text: `It can't use AutoPulse Connect: ${crm ? "its staff are signed out now" : "its owner and team are stopped"}, and its website chat shows 'Chat is not available'. Its chats and leads stay; you can still open it.`, okLabel: "Unsubscribe" });
  if (!ok) return;
  try {
    const r = await api(`/api/admin/stores/${encodeURIComponent(s.id)}/subscription`, { method: "POST", body: { subscribed: on } });
    toast(on ? `${s.name} is subscribed` : `${s.name} is unsubscribed${r.signedOut ? ` · ${r.signedOut} signed out` : ""}`, "success");
    loadStores();
  } catch (error) {
    toast(error.message, "error");
  }
}

function closeRowMenus(except) {
  for (const d of document.querySelectorAll("details.row-actions[open]")) if (d !== except) d.open = false;
  // A menu whose row was redrawn while it was open has nothing to go back to.
  for (const m of document.querySelectorAll("body > .row-actions-menu")) if (!m.owner?.isConnected) m.remove();
}

function actionsFor(s) {
  const { h } = ctx;
  const items = storeActions(s);
  const list = h("div", { class: "row-actions-menu", role: "menu" }, ...items.map((a) => {
    const b = h("button", { type: "button", role: "menuitem", class: `row-actions-item${a.danger ? " danger" : ""}${a.off ? " is-disabled" : ""}`, text: a.label, "data-act": a.key });
    if (a.off) { b.setAttribute("aria-disabled", "true"); b.dataset.tip = a.off; }
    return b;
  }));
  const box = h("details", { class: "row-actions" },
    h("summary", { class: "btn row-actions-btn", "aria-label": `Actions for ${s.name}`, "data-tip": "What to do with this store", text: "Actions" }), list);
  list.owner = box;
  box.addEventListener("toggle", () => {
    if (!box.open) { box.append(list); return; }
    closeRowMenus(box);
    // Lifted out of the table while open: the sticky Actions column would otherwise paint over it.
    document.body.append(list);
    // Fixed position so the table's scroll box never cuts it off; open upwards near the bottom of the window.
    const r = box.querySelector("summary").getBoundingClientRect();
    list.style.top = list.style.bottom = "";
    list.style.right = `${Math.max(6, innerWidth - r.right)}px`;
    const below = innerHeight - r.bottom;
    if (below < list.offsetHeight + 12 && r.top > below) list.style.bottom = `${innerHeight - r.top + 4}px`;
    else list.style.top = `${r.bottom + 4}px`;
  });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    box.open = false;
    const action = b.dataset.act;
    if (action === "open") openStore(s, "dashboard"); // you, as admin, viewing this store
    if (action === "details") openStore(s, "settings-dealership");
    if (action === "controls") openControls(s);
    if (action === "login") loginAs(s);
    if (action === "password") changePassword(s);
    if (action === "delete") deleteStore(s);
    if (action === "subscribe") setSubscribed(s, true);
    if (action === "unsubscribe") setSubscribed(s, false);
  });
  return box;
}

// Close an open Actions menu on an outside click, Escape, or when the page scrolls under it.
document.addEventListener("click", (e) => { if (!e.target.closest?.("details.row-actions, .row-actions-menu")) closeRowMenus(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRowMenus(); });
addEventListener("scroll", () => closeRowMenus(), true);

// ---------- Store controls (AutoPulse admins switch parts of one dealership off) ----------
const CONTROL_INFO = {
  chat: ["Website chat", "Off: the chat bubble disappears from the dealer's website within about 5 minutes. Their website code stays as it is.", "Chat off"],
  ai: ["AI replies", "Off: the AI stops answering on every channel (website, WhatsApp, SMS, Messenger); the team answers everything.", "AI off"],
  signin: ["Dealer sign-in", "Off: the dealer and their team cannot use the inbox (they see that AutoPulse paused access). Nothing is deleted; you can still log in as them.", "Sign-in paused"],
  tracking: ["Visitor tracking", "Off: visitor tracking is forced off on their website, whatever the store chose.", "Tracking off"],
  whatsapp: ["WhatsApp", "Off: no AI or staff messages; chats hidden from their Inbox (kept); no WhatsApp button in the website chat.", "WhatsApp off"],
  sms: ["SMS", "Off: no AI or staff texts; SMS chats hidden from their Inbox (kept).", "SMS off"],
  messenger: ["Messenger", "Off: no AI or staff messages; chats hidden (kept); no Messenger button in the website chat.", "Messenger off"],
  instagram: ["Instagram", "Off: no AI or staff messages; chats hidden (kept); no Instagram button in the website chat.", "Instagram off"],
};
const CHANNEL_KEYS = ["whatsapp", "sms", "messenger", "instagram"];

function controlBadges(s) {
  const { h } = ctx;
  const off = Object.keys(CONTROL_INFO).filter((k) => s.controls && s.controls[k] === false);
  const badges = [
    ...(s.controls?.adfLive ? [h("span", { class: "tag known", text: "ADF live", "data-tip": "Lead e-mails go to the dealer's CRM" })] : []),
    ...off.map((k) => h("span", { class: "tag tag-warn", text: CONTROL_INFO[k][2] })),
  ];
  return badges.length ? h("div", { class: "ctl-badges" }, ...badges) : null;
}

async function openControls(s) {
  const { h, api, toast, confirmDialog } = ctx;
  let data;
  try {
    data = await api(`/api/admin/stores/${encodeURIComponent(s.id)}/controls`);
  } catch (error) {
    toast(error.message, "error");
    return;
  }
  let dialog = document.getElementById("controls-dialog");
  if (!dialog) {
    dialog = h("dialog", { id: "controls-dialog", class: "dialog" });
    document.body.append(dialog);
  }
  const inputs = {};
  const row = ([k, [label, help]]) => {
    inputs[k] = h("input", { type: "checkbox", checked: data.controls[k] !== false });
    return h("label", { class: "ctl-row" }, inputs[k], h("span", {}, h("strong", { text: label }), h("em", { text: help })));
  };
  const entries = Object.entries(CONTROL_INFO);
  // Lead e-mails (ADF): off = test mode (AutoPulse's test inbox); on = the dealer's CRM gets real leads.
  inputs.adfLive = h("input", { type: "checkbox", checked: data.controls.adfLive === true });
  const adfTo = (data.adfEmails || []).join(", ");
  const testBtn = h("button", { type: "button", class: "btn btn-sm", disabled: !adfTo }, "Send a test ADF lead");
  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    try {
      const r = await api(`/api/admin/stores/${encodeURIComponent(s.id)}/adf-test`, { method: "POST", body: {} });
      toast(r.mode === "test" ? `Test ADF lead sent to the test inbox (instead of ${r.intended.join(", ")})` : `Test ADF lead sent to ${r.recipients.join(", ")}`, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      testBtn.disabled = false;
    }
  });
  const rows = [
    h("h4", { class: "ctl-head", text: "Store" }), ...entries.filter(([k]) => !CHANNEL_KEYS.includes(k)).map(row),
    h("h4", { class: "ctl-head", text: "Channels this dealership may use" }), h("div", { class: "ctl-grid" }, ...entries.filter(([k]) => CHANNEL_KEYS.includes(k)).map(row)),
    h("h4", { class: "ctl-head", text: "Lead e-mails (ADF)" }),
    h("label", { class: "ctl-row" }, inputs.adfLive, h("span", {}, h("strong", { text: "Send ADF leads to the dealer (live)" }),
      h("em", { text: adfTo
        ? `Off (test mode): new leads, appointments and car-sold alerts go to AutoPulse's test inbox, marked with the dealer's address. On: they go to ${adfTo}.`
        : "No ADF address is set for this dealership yet (Settings → E-mails & alerts while viewing it). Until then nothing can be sent live." }))),
    h("div", { class: "btn-row" }, testBtn, h("span", { class: "hint", text: "Uses the same test / live routing as real leads; the customer is named 'AutoPulse Test Lead - please delete'." })),
  ];
  const save = h("button", { type: "submit", class: "btn btn-primary" }, "Save controls");
  const form = h("form", { class: "stack", method: "dialog" },
    h("h3", { text: `Store controls: ${data.store.name}` }),
    h("p", { class: "muted", text: `${data.store.website} · ${data.store.kind}. Ticked = on. Every change is in the audit log.` }),
    ...rows,
    data.controls.updatedAt ? h("p", { class: "hint", text: `Last changed ${new Date(data.controls.updatedAt).toLocaleString()}` }) : null,
    h("div", { class: "dialog-actions" }, h("button", { type: "button", class: "btn", onclick: () => dialog.close() }, "Cancel"), save));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.keys(inputs).map((k) => [k, inputs[k].checked]));
    const turningOff = Object.keys(body).filter((k) => k !== "adfLive" && !body[k] && data.controls[k] !== false);
    if (body.adfLive && !data.controls.adfLive && !await confirmDialog({ title: `Send real leads to ${data.store.name}?`, text: `From now on, new leads, appointments and car-sold alerts for this dealership are e-mailed to ${adfTo || "its ADF address"}. Other dealers stay in test mode.`, okLabel: "Switch ADF live" })) return;
    if (turningOff.length && !await confirmDialog({ title: `Switch off for ${data.store.name}?`, text: turningOff.map((k) => `${CONTROL_INFO[k][0]}: ${CONTROL_INFO[k][1]}`).join("\n\n"), okLabel: "Switch off" })) return;
    save.disabled = true;
    try {
      await api(`/api/admin/stores/${encodeURIComponent(s.id)}/controls`, { method: "POST", body });
      dialog.close();
      toast("Store controls saved", "success");
      loadStores();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      save.disabled = false;
    }
  });
  dialog.replaceChildren(form);
  if (!dialog.open) dialog.showModal();
}

/** Open a store view in a separate tab. Dealer accounts use an isolated tab session. */
async function openStore(s, target) {
  const { toast } = ctx;
  const tab = window.open("about:blank", "_blank");
  if (!tab) {
    toast("Allow pop-ups to open a dealership in a new tab", "error");
    return;
  }
  try { tab.opener = null; } catch {}
  // The new tab makes its own session and switches store there, so this tab keeps the store it is showing.
  tab.location.href = `/#open-store=${encodeURIComponent(s.id)}&view=${encodeURIComponent(target)}`;
}

/**
 * "Log in as dealer": a short confirmation whose button is a link to the dealer's inbox in a new tab. A link you
 * click always opens (no pop-up blocker, no blank tab waiting while you confirm); that tab signs in as the dealer.
 */
function loginAs(s) {
  const { h } = ctx;
  const url = `/#login-as=${encodeURIComponent(s.id)}`;
  const dialog = h("dialog", { class: "dialog" });
  const go = h("a", { href: url, target: "_blank", rel: "noopener", class: "btn btn-primary", text: "Log in as dealer" });
  go.addEventListener("click", () => setTimeout(() => dialog.close(), 0));
  dialog.append(h("form", { method: "dialog", class: "stack" },
    h("h3", { text: `Log in as ${s.name}?` }),
    h("p", { class: "muted", text: "The dealer's inbox opens in a new tab, exactly as they see it. It is recorded in the audit log. Use 'Back to admin' at the top of that tab to return." }),
    h("div", { class: "dialog-actions" }, h("button", { class: "btn", value: "cancel", text: "Cancel" }), go)));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  go.focus();
}

async function changePassword(s) {
  const { api, toast, confirmDialog } = ctx;
  const password = await confirmDialog({ title: `New password for ${s.contactName || s.name}`, text: "At least 12 characters, with letters and a number or symbol. Their other sessions are signed out.", okLabel: "Change password", input: true });
  if (!password) return;
  try {
    await api(`/api/admin/stores/${encodeURIComponent(s.id)}/password`, { method: "POST", body: { password } });
    toast("Password changed", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function deleteStore(s) {
  const { api, toast, confirmDialog } = ctx;
  const ok = await confirmDialog({ title: `Delete ${s.name}?`, text: "The store is removed: its website chat stops, its Facebook Page is disconnected, and a dealer account with no store left is turned off with its team. Its chats and leads stay, for the record (a super admin can delete a customer's data from the chat).", okLabel: "Delete store" });
  if (!ok) return;
  try {
    await api(`/api/admin/stores/${encodeURIComponent(s.id)}`, { method: "DELETE" });
    toast("Store deleted", "success");
    loadStores();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function addStore(event) {
  event.preventDefault();
  const { $, api, toast } = ctx;
  const form = event.currentTarget;
  showErr("store-add-error", "");
  const body = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
  try {
    const result = await api("/api/admin/stores", { method: "POST", body: { ...body, invite: body.access === "invite" } });
    $("store-add-dialog").close();
    if (result.invited) toast(`Store added. Invite e-mailed to ${body.email}`, "success");
    else {
      $("secret-title").textContent = "Store added: temporary password";
      $("secret-text").textContent = `${body.name} signs in with ${body.email} and this password, then chooses their own.`;
      $("secret-value").textContent = result.temporaryPassword;
      $("secret-dialog").showModal();
    }
    loadStores();
  } catch (error) {
    showErr("store-add-error", error.message);
  }
}

async function importCsv(event) {
  const { $, state, toast } = ctx;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const note = $("stores-import-result");
  note.hidden = false;
  note.textContent = "Importing…";
  try {
    const res = await legacyFetch("/api/admin/stores/import", {
      method: "POST",
      headers: { "content-type": "text/csv", "x-csrf-token": state.csrf, ...(state.sessionToken ? { "x-session-token": state.sessionToken } : {}) },
      credentials: "same-origin",
      body: file,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Import failed");
    const problems = data.results.filter((r) => !r.ok).slice(0, 5).map((r) => `row ${r.row}: ${r.error}`);
    note.textContent = `Imported ${data.added} store${data.added === 1 ? "" : "s"}${data.failed ? `, ${data.failed} skipped (${problems.join("; ")}${data.failed > 5 ? "; …" : ""})` : ""}. New dealers set their password with "Forgot password".`;
    loadStores();
  } catch (error) {
    note.textContent = error.message;
    toast(error.message, "error");
  }
}

// ---------- Back to admin ----------

export function showImpersonation(me) {
  const { $ } = ctx;
  if (!me.impersonatedBy) return;
  $("impersonation-text").textContent = `You are logged in as ${me.user.displayName} (opened by ${me.impersonatedBy.name}).`;
  $("impersonation-bar").hidden = false;
  $("impersonation-bar").parentElement.classList.add("has-banner");
}

async function backToAdmin() {
  const { api, toast } = ctx;
  try {
    const result = await api("/api/admin/return", { method: "POST", body: {} });
    location.href = result.signedOut ? "/login" : "/";
  } catch (error) {
    toast(error.message, "error");
  }
}

// ---------- outside services (Activity) ----------

export async function loadOutbound() {
  const { $, h, api } = ctx;
  if (!$("out-body")) return;
  const service = $("out-service").value;
  const failed = $("out-failed").checked;
  let data;
  try {
    data = await api(`/api/admin/outbound?page=${out.page}&perPage=${out.perPage}${service ? `&service=${encodeURIComponent(service)}` : ""}${failed ? "&failed=1" : ""}`);
  } catch {
    return;
  }
  const select = $("out-service");
  const keep = select.value;
  select.replaceChildren(h("option", { value: "", text: "All services" }), ...data.services.map((s) => h("option", { value: s, text: s })));
  select.value = data.services.includes(keep) ? keep : "";
  $("out-failures").hidden = !data.failures;
  $("out-failures").textContent = `${data.failures} failed`;
  $("out-body").replaceChildren(...(data.items.length ? data.items.map((r) => h("tr", { class: r.ok ? "" : "out-fail" },
    h("td", { class: "nowrap", text: new Date(r.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) }),
    h("td", { text: r.service }),
    h("td", { class: "mono out-call", text: `${r.method} ${r.host}${r.path}` }),
    h("td", {}, h("span", { class: `tag ${r.ok ? "known" : "tag-warn"}`, text: r.ok ? String(r.status) : r.status ? `${r.status} failed` : "No answer" }), r.error ? h("div", { class: "muted", text: r.error }) : null),
    h("td", { text: `${r.ms} ms` }),
  )) : [h("tr", {}, h("td", { colspan: "5", class: "muted records-empty", text: "No calls recorded yet." }))]));
  const from = data.total ? (data.page - 1) * data.perPage + 1 : 0;
  $("out-count").textContent = data.total ? `Showing ${from} to ${Math.min(data.page * data.perPage, data.total)} of ${data.total} calls` : "No calls";
  pager($("out-pager"), data.page, data.perPage, data.total, (p) => { out.page = p; loadOutbound(); });
}

// ---------- messaging permissions ----------

export async function loadMessaging() {
  const { $, api } = ctx;
  if ($("messaging-panel")?.hidden) return;
  showErr("messaging-error", "");
  try {
    const { controls } = await api("/api/admin/messaging");
    paintMessaging(controls);
  } catch (error) {
    showErr("messaging-error", error.message);
  }
}

function paintMessaging(controls) {
  const { $, h, api, toast } = ctx;
  $("messaging-controls").replaceChildren(...Object.entries(controls).map(([key, c]) => {
    const input = h("input", { type: "checkbox" });
    input.checked = c.on;
    input.disabled = !c.allowed;
    input.addEventListener("change", async () => {
      showErr("messaging-error", "");
      try {
        const { controls: next } = await api("/api/admin/messaging", { method: "POST", body: { controls: { [key]: input.checked } } });
        paintMessaging(next);
        toast(`${c.label}: ${input.checked ? "on" : "off"}`, "success");
      } catch (error) {
        input.checked = !input.checked;
        showErr("messaging-error", error.message);
      }
    });
    return h("div", { class: "control-row" },
      h("label", { class: "switch" }, input,
        h("span", { class: "switch-track" }, h("span", { class: "switch-thumb" })),
        h("span", { class: "switch-label", text: c.label })),
      h("p", { class: "hint", text: c.help }),
      c.allowed ? null : h("p", { class: "hint control-locked", text: `Not allowed on this server yet (${c.env}=false). Ask DevOps to turn it on once the account is approved.` }));
  }));
}

// ---------- global settings ----------

const SITE_FIELDS = ["siteName", "supportEmail", "supportPhone", "address", "facebook", "instagram", "linkedin", "twitter", "youtube"];

function paintLogo(slot, url) {
  const { $, h } = ctx;
  $(slot).replaceChildren(url ? h("img", { src: url, alt: "" }) : h("span", { class: "muted", text: "No logo" }));
}

export async function loadSite() {
  const { $, api } = ctx;
  if ($("site-panel")?.hidden) return;
  try {
    const { settings, view } = await api("/api/admin/site");
    const form = $("site-form");
    for (const f of SITE_FIELDS) form[f].value = settings[f] || "";
    paintLogo("site-logo-light", view.logoLight);
    paintLogo("site-logo-dark", view.logoDark);
  } catch (error) {
    showErr("site-error", error.message);
  }
}

async function saveSite(event) {
  event.preventDefault();
  const { api, toast } = ctx;
  showErr("site-error", "");
  const form = event.currentTarget;
  try {
    await api("/api/admin/site", { method: "POST", body: Object.fromEntries(SITE_FIELDS.map((f) => [f, form[f].value])) });
    toast("Global settings saved", "success");
  } catch (error) {
    showErr("site-error", error.message);
  }
}

async function uploadLogo(event, variant) {
  const { state, toast } = ctx;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const res = await legacyFetch(`/api/admin/site/logo?variant=${variant}`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream", "x-csrf-token": state.csrf, ...(state.sessionToken ? { "x-session-token": state.sessionToken } : {}) },
      credentials: "same-origin",
      body: file,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    paintLogo(`site-logo-${variant}`, variant === "dark" ? data.view.logoDark : data.view.logoLight);
    toast("Logo updated", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}
