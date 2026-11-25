// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/fbpage.js — edit the port script, not this file.
// Settings → Facebook Page: connect the dealership's own Facebook Page (Messenger) with Facebook Login for Business,
// pick the Page, or disconnect it. Server: app/api/routes/facebook-page.mjs, app/lib/facebook-connect.mjs.
let ctx = null;

// Facebook sends the person back to "/?fbpick=…" (or "?fberror=…"): read it before app.js tidies the address.
const back = new URLSearchParams(location.search);
let pick = back.get("fbpick") || "";
let returnError = back.get("fberror") || "";
let instagramOk = back.get("igok") || "";

const dateOf = (ms) => (ms ? new Date(Number(ms)).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");

export function initFacebookPage(deps) {
  ctx = deps;
}

function showError(message) {
  const el = ctx.$("fbpage-error");
  el.textContent = message || "";
  el.hidden = !message;
}

function note(text) {
  const el = ctx.$("fbpage-note");
  el.textContent = text || "";
  el.hidden = !text;
}

export async function loadFacebookPage() {
  const panel = ctx?.$("fbpage-panel");
  if (!panel) return;
  let data;
  try {
    data = await ctx.api("/api/facebook-page");
  } catch {
    panel.hidden = true;
    return;
  }
  // Shown to people who can connect, and to everyone once a Page is connected (so they know where chats come from).
  renderInstagram(data);
  panel.hidden = !(data.canEdit && data.ready) && !data.page;
  // Back from Facebook or Instagram: open this tab (the panels only become visible now, after the page has loaded).
  if (pick || returnError || instagramOk) setTimeout(() => document.querySelector('#settings-tabs [data-stab="channels"]')?.click(), 0);
  if (instagramOk) { ctx.toast(`Instagram ${instagramOk} is connected`, "success"); instagramOk = ""; }
  if (panel.hidden) { if (returnError) { ctx.toast(returnError, "error"); returnError = ""; } return; }
  showError(returnError);
  returnError = "";
  note(data.messengerOn ? "" : "Messenger is switched off for this store by AutoPulse. The Page can be connected, but no replies go out until it is switched on.");
  if (pick && data.canEdit && !data.page) return renderPicker(data);
  pick = "";
  renderStatus(data);
}

function renderStatus(data) {
  const { h, $ } = ctx;
  const body = $("fbpage-body");
  body.replaceChildren();
  if (data.page) {
    body.append(
      h("div", { class: "fbpage-card" },
        h("div", { class: "fbpage-icon", "aria-hidden": "true" }, "f"),
        h("div", { class: "fbpage-main" },
          h("strong", { text: data.page.name || `Page ${data.page.id}` }),
          h("span", { class: "muted", text: `Page ID ${data.page.id}${data.page.business ? ` · ${data.page.business}` : ""}${data.page.connectedAt ? ` · connected ${dateOf(data.page.connectedAt)}` : ""}` })),
        h("span", { class: data.page.working ? "vis-tag ok" : "vis-tag warn", text: data.page.working ? "Connected" : "Needs reconnecting" })),
    );
    body.append(h("div", { class: "fbpage-utility", id: "fbpage-utility" }, h("p", { class: "muted", text: "Loading appointment messages…" })));
    if (data.canEdit) {
      body.append(h("div", { class: "row" },
        h("button", { class: "btn btn-danger", type: "button", onclick: () => disconnect(data.page) }, "Disconnect Page")));
    }
    loadAppointmentMessages();
    return;
  }
  body.append(
    h("ol", { class: "fbpage-steps" },
      h("li", { text: "Sign in with Facebook (an admin of your dealership's Page)." }),
      h("li", { text: "Choose your dealership's Page." }),
      h("li", { text: "Done: new Messenger messages arrive in this inbox." })),
    h("div", { class: "row" },
      h("button", { class: "btn btn-primary", type: "button", id: "fbpage-connect", onclick: connect }, "Connect Facebook Page")),
  );
}

const STATUS_TAG = {
  APPROVED: ["vis-tag ok", "Approved"],
  PENDING: ["vis-tag warn", "Waiting for Meta"],
  IN_REVIEW: ["vis-tag warn", "Waiting for Meta"],
  REJECTED: ["vis-tag", "Rejected"],
  NOT_SET_UP: ["vis-tag", "Not set up"],
};
const KIND_LABEL = { confirmation: "Confirmation, sent when a visit is booked", reminder: "Reminder, sent 24 hours before the visit" };

// Appointment messages on Messenger (utility templates): status, and a button to set them up on the Page.
async function loadAppointmentMessages() {
  const { h, $ } = ctx;
  const box = $("fbpage-utility");
  if (!box) return;
  let data;
  try {
    data = await ctx.api("/api/facebook-page/appointment-messages");
  } catch (error) {
    box.replaceChildren(h("p", { class: "muted", text: `Appointment messages: ${error.message}` }));
    return;
  }
  const t = data.templates || {};
  const all = Object.values(t);
  const ready = all.length && all.every((x) => x.status === "APPROVED");
  box.replaceChildren(
    h("h4", { text: "Appointment messages on Messenger" }),
    h("p", { class: "muted", text: "When a visit is booked for a Messenger customer, they get a confirmation, and a reminder 24 hours before. These use Meta-approved utility templates, so they arrive even after the 24-hour reply window. Never promotions." }),
    h("div", { class: "fbpage-list" }, Object.entries(t).map(([kind, x]) => {
      const [cls, label] = STATUS_TAG[x.status] || ["vis-tag", x.status];
      return h("div", { class: "fbpage-card" },
        h("div", { class: "fbpage-main" },
          h("strong", { text: KIND_LABEL[kind] || kind }),
          h("span", { class: "muted", text: x.text.replace("{{1}}", "Sam").replace("{{2}}", "your dealership").replace("{{3}}", "Tue, Nov 25 at 3:00 PM") })),
        h("span", { class: cls, text: label }));
    })),
    data.canEdit && !ready
      ? h("div", { class: "row" }, h("button", { class: "btn btn-primary", type: "button", id: "fbpage-utility-setup", onclick: setUpAppointmentMessages }, "Set up appointment messages"))
      : null,
  );
}

async function setUpAppointmentMessages() {
  showError("");
  const btn = ctx.$("fbpage-utility-setup");
  if (btn) btn.disabled = true;
  try {
    await ctx.api("/api/facebook-page/appointment-messages", { method: "POST", body: {} });
    ctx.toast("Appointment messages are set up", "success");
  } catch (error) {
    showError(error.message);
  }
  await loadAppointmentMessages();
}

async function connect() {
  showError("");
  const btn = ctx.$("fbpage-connect");
  if (btn) btn.disabled = true;
  try {
    const { url } = await ctx.api("/api/facebook-page/connect", { method: "POST", body: {} });
    window.location.assign(url);
  } catch (error) {
    showError(error.message);
    if (btn) btn.disabled = false;
  }
}

async function renderPicker(data) {
  const { h, $ } = ctx;
  const body = $("fbpage-body");
  body.replaceChildren(h("p", { class: "muted", text: "Loading your Pages…" }));
  let pages;
  try {
    ({ pages } = await ctx.api(`/api/facebook-page/choices?pick=${encodeURIComponent(pick)}`));
  } catch (error) {
    pick = "";
    showError(error.message);
    return renderStatus(data);
  }
  body.replaceChildren(
    h("p", { text: "Choose your dealership's Page:" }),
    h("div", { class: "fbpage-list" }, pages.map((p) => h("div", { class: "fbpage-card" + (p.available ? "" : " off") },
      h("div", { class: "fbpage-icon", "aria-hidden": "true" }, "f"),
      h("div", { class: "fbpage-main" },
        h("strong", { text: p.name || `Page ${p.id}` }),
        h("span", { class: "muted", text: [p.category, p.business ? `Business: ${p.business}` : "", p.note].filter(Boolean).join(" · ") || `Page ID ${p.id}` })),
      p.available
        ? h("button", { class: "btn btn-primary", type: "button", onclick: (ev) => choose(p, ev.currentTarget) }, "Connect this Page")
        : h("span", { class: "vis-tag", text: "Not available" })))),
    h("div", { class: "row" },
      h("button", { class: "btn", type: "button", onclick: () => { pick = ""; renderStatus(data); } }, "Cancel")),
  );
}

async function choose(page, btn) {
  showError("");
  btn.disabled = true;
  try {
    await ctx.api("/api/facebook-page/select", { method: "POST", body: { pick, pageId: page.id } });
    pick = "";
    ctx.toast(`${page.name || "The Page"} is connected`, "success");
    await loadFacebookPage();
  } catch (error) {
    showError(error.message);
    btn.disabled = false;
  }
}

async function disconnect(page) {
  const ok = await ctx.confirmDialog({
    title: "Disconnect this Facebook Page?",
    text: `New Messenger messages to ${page.name || "this Page"} will stop arriving here, and replies to its chats will stop. Existing chats stay in the inbox. You can connect again at any time.`,
    okLabel: "Disconnect",
  });
  if (!ok) return;
  try {
    await ctx.api("/api/facebook-page/disconnect", { method: "POST", body: {} });
    ctx.toast("The Facebook Page is disconnected", "success");
    await loadFacebookPage();
  } catch (error) {
    showError(error.message);
  }
}

// ---------- Instagram ----------
// Two ways: the Instagram account linked to the connected Facebook Page comes with it; or "Connect Instagram"
// (Instagram Login) for an account that is not linked to a Page.
function renderInstagram(data) {
  const { h, $ } = ctx;
  const panel = $("instagram-panel");
  const body = $("instagram-body");
  if (!panel || !body) return;
  panel.hidden = !(data.canEdit && (data.ready || data.instagramLogin)) && !data.instagram;
  if (panel.hidden) return;
  body.replaceChildren();
  if (!data.instagramOn) body.append(h("p", { class: "callout", text: "Instagram is switched off for this store by AutoPulse. The account can be connected, but no replies go out until it is switched on." }));
  const ig = data.instagram;
  if (ig) {
    const via = ig.via === "page" ? "linked to your Facebook Page" : ig.via === "unified" ? "connected with Instagram (business login)" : `connected with Instagram${ig.expiresAt ? ` · renews automatically` : ""}`;
    body.append(h("div", { class: "fbpage-card" },
      h("div", { class: "fbpage-icon ig-icon", "aria-hidden": "true" }, "IG"),
      h("div", { class: "fbpage-main" },
        h("strong", { text: ig.username ? `@${ig.username}` : `Instagram ${ig.id}` }),
        h("span", { class: "muted", text: `${via}${ig.connectedAt ? ` · connected ${dateOf(ig.connectedAt)}` : ""}` })),
      h("span", { class: ig.working ? "vis-tag ok" : "vis-tag warn", text: ig.working ? "Connected" : "Needs reconnecting" })));
    if (data.canEdit && ig.via !== "page") {
      body.append(h("div", { class: "row" }, h("button", { class: "btn btn-danger", type: "button", onclick: () => disconnectInstagram(ig) }, "Disconnect Instagram")));
    }
    return;
  }
  body.append(h("p", { class: "muted", text: data.page
    ? "No Instagram account is linked to your Facebook Page. Link it in Meta Business Suite and connect the Page again, or connect your Instagram account here."
    : "Connect your Facebook Page above (its linked Instagram account comes with it), or connect your Instagram account here." }));
  if (data.canEdit && data.instagramLogin) {
    body.append(h("div", { class: "row" }, h("button", { class: "btn btn-primary", type: "button", id: "instagram-connect", onclick: connectInstagram }, "Connect Instagram")));
  }
}

async function connectInstagram() {
  showError("");
  const btn = ctx.$("instagram-connect");
  if (btn) btn.disabled = true;
  try {
    const { url } = await ctx.api("/api/instagram/connect", { method: "POST", body: {} });
    window.location.assign(url);
  } catch (error) {
    showError(error.message);
    if (btn) btn.disabled = false;
  }
}

async function disconnectInstagram(ig) {
  const ok = await ctx.confirmDialog({
    title: "Disconnect this Instagram account?",
    text: `New Instagram messages to @${ig.username || ig.id} will stop arriving here, and replies to its chats will stop. Existing chats stay in the inbox.`,
    okLabel: "Disconnect",
  });
  if (!ok) return;
  try {
    await ctx.api("/api/instagram/disconnect", { method: "POST", body: {} });
    ctx.toast("Instagram is disconnected", "success");
    await loadFacebookPage();
  } catch (error) {
    showError(error.message);
  }
}
