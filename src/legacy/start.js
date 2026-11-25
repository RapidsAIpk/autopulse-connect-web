// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/start.js — edit the port script, not this file.
// Dashboard guidance: "Get started" (a checklist that ticks itself from the store's real set-up, each step opening the
// right page) and quick actions for the common jobs. Steps the person may not do (agents) are left out.
let ctx = null;

export function initStart(deps) {
  ctx = deps;
  for (const id of ["start-steps", "quick-actions"]) {
    ctx.$(id)?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-go], [data-act]");
      if (!b) return;
      if (b.dataset.go) ctx.showView(b.dataset.go);
      if (b.dataset.act) ACTIONS[b.dataset.act]?.();
    });
  }
}

const ICON = {
  inbox: '<path d="M4 5h16v10h-4.5l-1.5 3h-4l-1.5-3H4z"/>',
  lead: '<circle cx="10" cy="8" r="3.4"/><path d="M3.5 19.5c.7-3.6 3.3-5.6 6.5-5.6M18 14v6M15 17h6"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2h3v-2M17 16v2h3v-2"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M18 8v6M15 11h6"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  page: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  store: '<path d="M4 9.5 5.5 5h13L20 9.5M4 9.5h16M5.5 12v7h13v-7M10 19v-4h4v4"/>',
  ai: '<path d="M12 3l2.2 4.6L19 8.3l-3.5 3.4.8 4.9L12 14.3l-4.3 2.3.8-4.9L5 8.3l4.8-.7z"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ""}</svg>`;

const ACTIONS = {
  addCar: () => { ctx.showView("vehicles"); setTimeout(() => ctx.$("stock-add")?.click(), 600); },
  addPerson: () => { ctx.showView("staff"); setTimeout(() => ctx.$("team-add-btn")?.click(), 600); },
};

const safe = (p) => p.then((v) => v).catch(() => null);

/** Called when the dashboard opens. */
export async function loadStart() {
  const { $, api, h } = ctx;
  const kind = ctx.state?.store || {};
  const none = Promise.resolve(null);
  const [store, ai, widget, stock, team, page, chats] = await Promise.all([
    safe(api("/api/store-profile")), kind.inboxOnly ? safe(api("/api/dealership/ai-profile")) : none, safe(api("/api/store-widget")),
    kind.inboxOnly ? safe(api("/api/stock")) : none, kind.hasTeam ? safe(api("/api/team")) : none, kind.hasTeam ? safe(api("/api/store-page")) : none,
    safe(api("/api/contacts?channel=website&limit=1")),
  ]);
  const manage = Boolean(store?.canEdit); // this person runs the store (owner, manager, dealer, admin)
  const profile = store?.profile || {};
  const steps = [];
  if (store && manage) steps.push({ icon: "store", title: "Store details", text: "Address, phone and opening hours, used on your pages and by the AI.", done: Boolean(profile.street && (profile.callNumber || profile.contactPhone)), go: "store" });
  if (ai && ai.canEdit) steps.push({ icon: "ai", title: "What the AI knows", text: "Credit application and trade-in links, and a short note about the dealership.", done: Boolean(ai.about || Object.values(ai.links || {}).some(Boolean)), go: "store" });
  if (widget && manage) steps.push({ icon: "chat", title: "Website chat", text: "Set the look and hours, then put the code on your website.", done: Boolean((chats?.contacts || []).length), go: "chatwidget" });
  if (stock && stock.canEdit) steps.push({ icon: "car", title: "Your cars", text: stock.mode === "own" ? "Add your cars (or import a CSV) so customers and the AI see them." : "Your cars come from the AutoPulse feed. Switch to your own inventory if you are not in it.", done: stock.mode === "feed" || (stock.counts?.active || 0) > 0, go: "vehicles" });
  if (team && team.you?.canManage) steps.push({ icon: "team", title: "Your team", text: "Add the people who answer chats, with their departments.", done: (team.team || []).length > 1, go: "staff" });
  if (page && page.canEdit) steps.push({ icon: "page", title: "Dealership page", text: "Turn on your page and share its link or QR code.", done: page.page?.visibility !== "off", go: "pages" });

  const done = steps.filter((s) => s.done).length;
  $("start-panel").hidden = !steps.length || done === steps.length;
  if (steps.length) {
    $("start-count").textContent = `${done} of ${steps.length} done`;
    $("start-bar").style.width = `${Math.round((done / steps.length) * 100)}%`;
    $("start-steps").replaceChildren(...steps.map((s, i) => {
      const li = h("li", { class: `start-step${s.done ? " done" : ""}` });
      li.innerHTML = `<span class="ico">${svg(s.icon)}</span><span class="txt"><strong>${i + 1}. ${s.title}</strong><small>${s.text}</small></span>`;
      li.append(h("button", { type: "button", class: `btn btn-sm${s.done ? "" : " btn-primary"}`, "data-go": s.go, text: s.done ? "Done ✓ · Open" : "Set up" }));
      return li;
    }));
  }

  const actions = [
    { icon: "inbox", label: "Open the inbox", go: "inbox", color: "sky" },
    { icon: "lead", label: "See new leads", go: "leads", color: "green" },
    stock?.canEdit && stock.mode === "own" ? { icon: "car", label: "Add a car", act: "addCar", color: "orange" } : { icon: "car", label: "Browse vehicles", go: "vehicles", color: "orange" },
    team?.you?.canManage ? { icon: "team", label: "Add a person", act: "addPerson", color: "violet" } : null,
    widget && manage ? { icon: "chat", label: "Website chat code", go: "chatwidget", color: "pink" } : null,
    page ? { icon: "page", label: "Share your pages", go: "pages", color: "teal" } : null,
  ].filter(Boolean);
  $("quick-actions").replaceChildren(...actions.map((a) => {
    const b = h("button", { type: "button", class: `quick c-${a.color}`, ...(a.go ? { "data-go": a.go } : { "data-act": a.act }) });
    b.innerHTML = `${svg(a.icon)}<span>${a.label}</span>`;
    return b;
  }));
}
