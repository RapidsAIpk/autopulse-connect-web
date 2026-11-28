// What's happening, for the people working the chats:
// - the AI takeover countdown ("AI answers in 2:41 if no one replies") in the open chat and the chat list,
// - what AutoPulse switched off and the subscription: a ⚠ chip in the top bar with a popup (admin's reasons),
//   and Settings → Subscription & features for everyone in the store,
// - Store links: send the store's links (inventory, credit application, trade-in, website) from the composer.
let ctx = null;
const takeovers = new Map(); // chat key → { at, minutes }
let status = null; // GET /api/store-status

export function initClarity(deps) {
  ctx = deps;
  addFeaturesTab();
  addRestrictionChip();
  addLinksButton();
  addNoteIcon();
  setInterval(tick, 1000);
  refreshStoreStatus();
}

// ============================== AI takeover countdown ==============================
const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const minutes = () => Number(ctx?.state?.aiTakeoverMinutes) || 3;

/** From the open chat or the live 'takeover' event: at = when the AI steps in (null = no countdown). */
export function setTakeover(phone, at, mins) {
  if (!phone) return;
  if (at && Number(at) > Date.now()) takeovers.set(phone, { at: Number(at), minutes: Number(mins) || minutes() });
  else takeovers.delete(phone);
  const a = ctx?.state?.active;
  if (a && a.phone === phone) paintTimer(a);
  if (ctx?.state?.contacts?.some((c) => c.phone === phone)) ctx.refreshList?.();
}

export function timerTag(phone) {
  const t = takeovers.get(phone);
  if (!t || t.at <= Date.now()) return null;
  return ctx.h("span", { class: "tag ai-wait", "data-takeover": phone, title: "A customer is waiting for a reply. The AI answers when the timer ends.", text: `⏱ ${mmss(t.at - Date.now())}` });
}

/** Opens Settings → AI replies (where "AI takes over after" is set). */
export function aiSettingsLink(text = "AI replies settings") {
  return ctx.h("button", { type: "button", class: "link-btn ai-settings-link", onclick: (e) => { e.preventDefault(); openSettingsTab("ai"); } }, `⚙ ${text}`);
}

function openSettingsTab(tab) {
  ctx.showView("settings");
  setTimeout(() => document.querySelector(`#settings-tabs [data-stab="${tab}"]`)?.click(), 250);
}

/** The pill next to the AI switch: countdown while a customer waits, else what AI off / on means. */
export function paintTimer(c) {
  const { h } = ctx;
  // On the line under the customer's name (the header's button row can be too full to show it).
  const meta = document.querySelector(".thread-meta");
  if (!meta) return;
  let pill = document.getElementById("ai-timer");
  if (!pill) pill = h("span", { class: "ai-timer", id: "ai-timer", tabindex: "0", role: "button" });
  if (pill.parentElement !== meta) meta.append(pill);
  const t = c ? takeovers.get(c.phone) : null;
  const n = t?.minutes || minutes();
  if (!c || c.isGroup || c.isBroadcast) { pill.hidden = true; return; }
  pill.hidden = false;
  if (t && t.at > Date.now() && !c.botEnabled) {
    const left = t.at - Date.now();
    pill.className = `ai-timer counting${left < 30_000 ? " soon" : ""}`;
    pill.replaceChildren(h("span", { class: "ai-timer-ic", text: "⏱" }), h("span", {}, "AI answers in ", h("b", { class: "ai-timer-left", text: mmss(left) }), " if no one replies"));
    pill.dataset.tip = `The customer is waiting for a reply. Reply now to keep the chat, or the AI answers when the timer ends (after ${n} min). Change the time in Settings → AI replies.`;
  } else if (!c.botEnabled) {
    pill.className = "ai-timer paused";
    pill.replaceChildren(h("span", { class: "ai-timer-ic", text: "⏸" }), h("span", { text: "AI paused · team handling" }));
    pill.dataset.tip = `The AI stays quiet while your team handles this chat, so the customer never gets two answers. If the customer writes and nobody replies within ${n} min, the AI answers. Change the time in Settings → AI replies.`;
  } else {
    pill.className = "ai-timer on";
    pill.replaceChildren(h("span", { class: "ai-timer-ic", text: "🤖" }), h("span", { text: "AI answering" }));
    pill.dataset.tip = `The AI answers this customer. If you reply, the AI steps back for this chat so the customer doesn't get two answers; if a customer then waits ${n} min with no reply, the AI answers again.`;
  }
  pill.title = pill.dataset.tip;
  pill.onclick = () => openSettingsTab("ai");
}

// ============================== chat note → header icon ==============================
// What this chat allows (24-hour window, live chat, AI pause…) used to be a line above the message box. It now lives
// behind a small icon in the chat header: ⓘ for information, an amber ⚠ when you can't reply here. Click to read.
function addNoteIcon() {
  const { h } = ctx;
  const note = document.getElementById("composer-note");
  if (!note || document.getElementById("chat-note-btn")) return;
  const btn = h("button", { type: "button", class: "chat-note-btn", id: "chat-note-btn", hidden: true, "aria-haspopup": "dialog", "aria-expanded": "false" });
  const pop = h("div", { class: "chat-note-pop", id: "chat-note-pop", role: "dialog", hidden: true });
  pop.append(note); // app.js keeps filling #composer-note; it is now read inside this popover
  note.classList.add("in-pop");
  btn.addEventListener("click", (e) => { e.stopPropagation(); toggleNotePop(pop.hidden); });
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) toggleNotePop(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleNotePop(false); });
  btn._pop = pop;
  document.body.append(pop);
}

function toggleNotePop(open) {
  const btn = document.getElementById("chat-note-btn");
  const pop = document.getElementById("chat-note-pop");
  if (!btn || !pop) return;
  if (open && !btn.hidden) {
    const r = btn.getBoundingClientRect();
    pop.hidden = false;
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.round(Math.max(12, Math.min(r.left, window.innerWidth - pop.offsetWidth - 12)))}px`;
  } else pop.hidden = true;
  btn.setAttribute("aria-expanded", String(!pop.hidden));
}

/** Called after the open chat's note is worked out (app.js). */
export function paintNoteIcon() {
  const note = document.getElementById("composer-note");
  const btn = document.getElementById("chat-note-btn");
  const meta = document.querySelector(".thread-meta");
  if (!note || !btn || !meta) return;
  if (btn.parentElement !== meta) meta.append(btn);
  const text = note.textContent.trim();
  const blocked = note.dataset.blocked === "1";
  btn.hidden = note.hidden || !text;
  btn.className = `chat-note-btn${blocked ? " blocked" : ""}`;
  btn.textContent = blocked ? "⚠" : "i";
  btn.title = blocked ? "You can't reply here right now. Click to see why." : "About this chat. Click to read.";
  btn.setAttribute("aria-label", btn.title);
  if (btn.hidden) toggleNotePop(false);
}

function tick() {
  if (!takeovers.size) return;
  const now = Date.now();
  for (const [phone, t] of takeovers) {
    if (t.at <= now) { takeovers.delete(phone); if (ctx.state.active?.phone === phone) paintTimer(ctx.state.active); continue; }
    for (const tag of document.querySelectorAll(`[data-takeover="${CSS.escape(phone)}"]`)) tag.textContent = `⏱ ${mmss(t.at - now)}`;
  }
  const a = ctx.state.active;
  const t = a && takeovers.get(a.phone);
  if (t) {
    const left = document.querySelector("#ai-timer .ai-timer-left");
    if (left) left.textContent = mmss(t.at - now);
    document.getElementById("ai-timer")?.classList.toggle("soon", t.at - now < 30_000);
  }
}

// ============================== restrictions & subscription ==============================
function addRestrictionChip() {
  const { h } = ctx;
  const right = document.querySelector(".topbar-right");
  if (!right || document.getElementById("restrict-chip")) return;
  const chip = h("button", { type: "button", class: "restrict-chip", id: "restrict-chip", hidden: true, onclick: openRestrictions });
  right.prepend(chip);
}

/** Load what is on / off for the store being viewed and paint the ⚠ chip (called at start and when the store changes). */
export async function refreshStoreStatus() {
  if (!ctx) return; // before start-up finished: initClarity loads it
  try {
    status = await ctx.api("/api/store-status");
  } catch {
    status = null;
  }
  paintChip();
  if (!document.getElementById("features-panel")?.hidden) paintFeatures();
}

// The ⚠ in the top bar: an icon only (details in its popup). Anyone it bothers can hide it for themselves; it comes
// back when something changes (another switch, a new reason, a new end date, the subscription stopping).
function chipSignature() {
  const sub = status?.subscription || {};
  return JSON.stringify([sub.on, sub.on && sub.ending ? sub.endsOn : null, (status?.restrictions || []).map((x) => [x.key, x.note || ""])]);
}
function hiddenKey() {
  return `ap-alert-hidden:${ctx.state?.me?.id || ""}:${status?.storeId || status?.store || ""}`;
}
function chipHidden() {
  try { return localStorage.getItem(hiddenKey()) === chipSignature(); } catch { return false; }
}
function hideChip() {
  try { localStorage.setItem(hiddenKey(), chipSignature()); } catch { /* private window: it just stays */ }
  paintChip();
  ctx.toast?.("Hidden for you. It comes back if anything changes. Everything is still in Settings → Subscription & features.", "success");
}

function paintChip() {
  const chip = document.getElementById("restrict-chip");
  if (!chip) return;
  const r = status?.restrictions || [];
  const sub = status?.subscription;
  const ending = sub && sub.on && sub.ending;
  const off = sub && !sub.on;
  const count = r.filter((x) => x.key !== "unsubscribed").length;
  if (!status?.store || (!count && !ending && !off) || chipHidden()) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.className = `restrict-chip${off || (ending && sub.daysLeft <= 7) ? " red" : ""}`;
  const parts = [];
  if (off) parts.push("Not subscribed");
  else if (ending) parts.push(`Subscription ends ${fmtDate(sub.endsOn)}`);
  if (count) parts.push(`${count} feature${count === 1 ? "" : "s"} switched off by AutoPulse`);
  chip.replaceChildren(ctx.h("span", { class: "restrict-ic", text: "⚠" }));
  chip.title = `${parts.join(" · ")}. Click for details.`;
  chip.setAttribute("aria-label", chip.title);
}

const fmtDate = (d) => {
  if (!d) return "";
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return d; }
};

function openRestrictions() {
  const { h } = ctx;
  const admin = ctx.isSuperAdmin?.();
  const r = status?.restrictions || [];
  const sub = status?.subscription;
  const dlg = h("dialog", { class: "dialog restrict-dialog" });
  const items = [];
  if (sub && !sub.on) items.push({ key: "unsubscribed", text: "Not subscribed: AutoPulse Connect and the website chat are off for this store." });
  else if (sub?.ending) items.push({ key: "ending", text: `The subscription ends on ${fmtDate(sub.endsOn)} (${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"} left).` });
  for (const x of r) if (x.key !== "unsubscribed" || !items.some((i) => i.key === "unsubscribed")) items.push(x);
  dlg.append(
    h("div", { class: "sup-dialog-head" }, h("h3", { text: admin ? "Switched off for this store by AutoPulse" : "What AutoPulse switched off for your dealership" }), h("button", { type: "button", class: "icon-btn", "aria-label": "Close", text: "×", onclick: () => dlg.close() })),
    h("ul", { class: "restrict-list" }, items.map((x) => h("li", { class: `rl-${x.key}` }, h("span", { class: "restrict-ic", text: "⚠" }), h("div", {}, h("b", { text: x.text }), x.note ? h("p", { class: "restrict-note" }, h("span", { class: "muted", text: "Why: " }), x.note) : null)))),
    h("p", { class: "muted small", text: admin ? "Change it in Stores → Actions → Store controls (or Subscribe)." : "Your team can still reply where only the AI is off. To turn something back on, ask AutoPulse in Support." }),
    h("div", { class: "row-end" },
      admin ? null : h("button", { type: "button", class: "btn", text: "Ask AutoPulse", onclick: () => { dlg.close(); ctx.showView("support"); } }),
      h("button", { type: "button", class: "btn btn-ghost", text: "Hide this icon", title: "Only for you. It comes back if anything changes.", onclick: () => { dlg.close(); hideChip(); } }),
      h("button", { type: "button", class: "btn btn-primary", text: "See all features", onclick: () => { dlg.close(); openSettingsTab("features"); } })));
  dlg.addEventListener("close", () => setTimeout(() => dlg.remove(), 50));
  document.body.append(dlg);
  dlg.showModal();
}

function addFeaturesTab() {
  const { h } = ctx;
  const tabs = document.getElementById("settings-tabs");
  const grid = document.getElementById("settings-grid");
  if (!tabs || !grid || document.getElementById("features-panel")) return;
  const tab = h("button", { type: "button", class: "seg-btn", "data-stab": "features", role: "tab", text: "Subscription & features" });
  tabs.insertBefore(tab, tabs.querySelector('[data-stab="site"]') || null);
  grid.append(h("div", { class: "panel pad features-panel", id: "features-panel", "data-stab": "features" }, h("h3", { text: "Subscription & features" }), h("div", { id: "features-body", class: "stack" }, h("p", { class: "muted", text: "Loading…" }))));
}

/** Settings → Subscription & features (opening Settings calls this). */
export async function loadFeatures() {
  await refreshStoreStatus();
  paintFeatures();
}

function paintFeatures() {
  const { h } = ctx;
  const body = document.getElementById("features-body");
  const panel = document.getElementById("features-panel");
  if (!body || !panel) return;
  if (!status?.store) { panel.hidden = true; ctx.refreshTabs?.(); return; }
  panel.hidden = false;
  const sub = status.subscription || {};
  const groups = [...new Set(status.features.map((f) => f.group))];
  body.replaceChildren(
    h("p", { class: "muted", text: "Everything AutoPulse Connect does for your dealership, and anything AutoPulse has switched off (with the reason)." }),
    h("div", { class: "feat-sub" },
      h("div", {}, h("span", { class: "muted small", text: "Subscription" }), h("b", { class: `feat-state ${sub.on ? "ok" : "off"}`, text: sub.on ? sub.statusLabel || "Active" : "Not subscribed" })),
      sub.plan ? h("div", {}, h("span", { class: "muted small", text: "Plan" }), h("b", { text: sub.plan })) : null,
      sub.endsOn ? h("div", {}, h("span", { class: "muted small", text: sub.ending ? "Ends on (soon)" : "Ends on" }), h("b", { class: sub.ending ? "feat-state warn" : "", text: fmtDate(sub.endsOn) })) : sub.paidUntil ? h("div", {}, h("span", { class: "muted small", text: "Paid until" }), h("b", { text: fmtDate(sub.paidUntil) })) : null,
      document.querySelector('#settings-tabs [data-stab="billing"]:not([hidden])') ? h("button", { type: "button", class: "btn btn-sm", text: "Billing →", onclick: () => openSettingsTab("billing") }) : null),
    ...groups.map((g) => h("div", { class: "feat-group" },
      h("h4", { class: "ai-channel-title", text: g }),
      h("table", { class: "table feat-table" }, h("tbody", {}, status.features.filter((f) => f.group === g).map((f) => h("tr", { class: f.on ? "" : "is-off" },
        h("td", { class: "feat-name", text: f.label }),
        h("td", { class: "feat-on" }, h("span", { class: `feat-state ${f.on ? "ok" : "off"}`, text: f.on ? "✓ On" : "⚠ Off by AutoPulse" })),
        h("td", { class: "feat-why muted", text: f.on ? "" : f.note || "No reason given. Ask AutoPulse in Support." }))))))));
}

// ============================== Store links (composer) ==============================
function addLinksButton() {
  const { h } = ctx;
  const inv = document.getElementById("inventory-btn");
  if (!inv || document.getElementById("links-btn")) return;
  const btn = h("button", { type: "button", class: "composer-tool", id: "links-btn", title: "Send a store link (inventory, credit application, trade-in, website). Set them in Store → What the AI knows.", "aria-label": "Store links" });
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>';
  inv.after(btn);
  const pop = h("div", { class: "inventory-pop links-pop", id: "links-pop", hidden: true });
  document.getElementById("inventory-pop")?.after(pop);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = pop.hidden;
    ctx.hideComposerPops?.();
    if (open) { pop.hidden = false; loadLinks(pop); }
  });
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) pop.hidden = true; });
}

const MESSAGE_TEXT = { inventory: "See our cars", credit: "Apply for financing", trade: "Find out what your trade-in is worth", website: "Our website" };

async function loadLinks(pop) {
  const { h, api, toast } = ctx;
  pop.replaceChildren(h("p", { class: "inventory-status", text: "Loading the store's links…" }));
  let links = [];
  try { links = (await api("/api/store-links")).links || []; } catch {}
  const goSet = h("button", { type: "button", class: "link-btn", text: "Set the links in Store → What the AI knows", onclick: () => { pop.hidden = true; ctx.showView("store"); setTimeout(() => document.getElementById("ai-profile-panel")?.scrollIntoView({ behavior: "smooth" }), 400); } });
  if (!links.length) { pop.replaceChildren(h("p", { class: "inventory-status", text: "No store links yet." }), goSet); return; }
  pop.replaceChildren(
    h("div", { class: "links-head" }, h("b", { text: "Send a store link" }), h("span", { class: "muted small", text: "Send posts it now; Insert puts it in your message to edit." })),
    ...links.map((l) => {
      const text = `${MESSAGE_TEXT[l.key] || l.label}: ${l.url}`;
      return h("div", { class: "link-row" },
        h("div", { class: "link-info" }, h("b", { text: l.label }), h("a", { href: l.url, target: "_blank", rel: "noopener", text: l.url })),
        h("button", { type: "button", class: "btn btn-sm", text: "Insert", onclick: () => { pop.hidden = true; ctx.insertComposer(text, { newline: true }); } }),
        h("button", { type: "button", class: "btn btn-sm btn-primary", text: "Send", onclick: async (e) => {
          const phone = ctx.state.active?.phone;
          if (!phone) return;
          e.currentTarget.disabled = true;
          try {
            await api(`/api/contacts/${encodeURIComponent(phone)}/messages`, { method: "POST", body: { body: text } });
            pop.hidden = true;
            toast(`${l.label} link sent`, "success");
          } catch (err) {
            toast(err.message, "error");
            e.currentTarget.disabled = false;
          }
        } }));
    }),
    goSet);
}

/** Same rules as the Inventory button (called after the composer is painted). */
export function syncLinksButton() {
  const btn = document.getElementById("links-btn");
  const inv = document.getElementById("inventory-btn");
  if (btn && inv) { btn.disabled = inv.disabled; btn.hidden = inv.hidden; }
}

export function hideLinksPop() {
  const pop = document.getElementById("links-pop");
  if (pop) pop.hidden = true;
}
