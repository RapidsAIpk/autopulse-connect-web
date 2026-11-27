// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/visitors.js — edit the port script, not this file.
// Visitors page (who visits the dealer's website: identified, unverified, anonymous; pages and cars; exports;
// deleting a visitor's data) and Website chat → Visitor tracking (off / notice / ask first, notice text, privacy
// link, how long visits are kept). Server: app/api/routes/visitors.mjs and POST /api/store-widget {tracking}.
let ctx = null;
const t = { page: 1, perPage: 25, sort: "last", dir: "desc", filters: {}, loading: 0, data: null };
let tracking = null; // { settings, options, canEdit }

const STATUS = {
  identified: { label: "Identified", cls: "vis-tag ok", hint: "Gave their own details in the chat" },
  unverified: { label: "Unverified", cls: "vis-tag warn", hint: "Looked up details in the chat but did not confirm them" },
  anonymous: { label: "Anonymous", cls: "vis-tag", hint: "Has not told us who they are" },
};
const KIND_CLASS = { vdp: "k-car", srp: "k-search", pricing: "k-price", finance: "k-finance", trade: "k-trade", service: "k-service", contact: "k-contact", home: "k-home", other: "k-other" };

const dateTime = (ms) => (ms ? new Date(Number(ms)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const timeOnly = (ms) => (ms ? new Date(Number(ms)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");
const money = (n) => (Number(n) > 0 ? `$${Math.round(Number(n)).toLocaleString()}` : "");
function ago(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - Number(ms)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return new Date(Number(ms)).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function duration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (!s) return "";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60 ? `${s % 60}s` : ""}`.trim() : `${Math.floor(m / 60)}h ${m % 60}m`;
}
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const carTitle = (v, vin) => v?.title || [v?.year, v?.make, v?.model].filter(Boolean).join(" ") || (vin ? `VIN ${vin}` : "");

export function initVisitors(deps) {

  // Export menu: open towards whichever side has room (the button can sit at either end of the filter row).
  const exportBox = document.getElementById("visitors-export");
  exportBox?.addEventListener("toggle", () => {
    const menu = exportBox.querySelector(".vis-export-menu");
    if (!exportBox.open || !menu) return;
    menu.style.left = "0";
    menu.style.right = "auto";
    const box = (exportBox.closest(".panel") || document.body).getBoundingClientRect();
    if (menu.getBoundingClientRect().right > Math.min(box.right, window.innerWidth) - 4) { menu.style.left = "auto"; menu.style.right = "0"; }
  });  ctx = deps;
  const { $ } = ctx;
  const form = $("visitors-filters");
  if (!form) return;
  form.addEventListener("submit", (e) => { e.preventDefault(); readFilters(); t.page = 1; load(); });
  form.querySelector("[data-reset]").addEventListener("click", () => { form.reset(); readFilters(); t.page = 1; load(); });
  form.store.addEventListener("change", () => { readFilters(); t.page = 1; load(); });
  form.status.addEventListener("change", () => { readFilters(); t.page = 1; load(); });
  $("visitors-per-page").addEventListener("change", (e) => { t.perPage = Number(e.target.value) || 25; t.page = 1; load(); });
  for (const el of document.querySelectorAll("[data-go-visitors]")) el.addEventListener("click", (e) => { e.preventDefault(); ctx.showView("visitors"); });
  const tf = $("tracking-form");
  tf?.addEventListener("submit", saveTracking);
  tf?.addEventListener("change", paintTrackingState);
}

function readFilters() {
  const form = ctx.$("visitors-filters");
  t.filters = {
    search: form.search.value.trim(), status: form.status.value, store: form.store.value, from: form.from.value, to: form.to.value,
    cars: form.cars.checked ? "1" : "", returning: form.returning.checked ? "1" : "",
  };
}

function query(extra = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...t.filters, page: t.page, perPage: t.perPage, sort: t.sort, dir: t.dir, ...extra })) {
    if (v !== "" && v !== undefined && v !== null) params.set(k, v);
  }
  return params.toString();
}

/** Called when the Visitors page opens. */
export async function loadVisitorsView() {
  if (!ctx?.$("visitors-filters")) return;
  readFilters();
  await load();
}

async function load() {
  const seq = ++t.loading;
  try {
    const data = await ctx.api(`/api/visitors?${query()}`);
    if (seq !== t.loading) return;
    t.data = data;
    paint(data);
  } catch (error) {
    ctx.toast(error.message, "error");
  }
}

// ---------- the page ----------
function paint(data) {
  paintNotice(data);
  paintStores(data.stores);
  paintStats(data.summary || {});
  paintCars(data.summary?.topCars || []);
  paintKinds(data.summary?.kinds || []);
  paintTable(data);
  paintExport(data);
}

function paintNotice(data) {
  const { $, h } = ctx;
  const box = $("visitors-off");
  const tr = data.tracking;
  const off = tr && (tr.mode === "off" || !tr.widget);
  box.hidden = !off;
  if (!off) return;
  box.replaceChildren(
    h("span", { text: !tr.widget
      ? "This store's website chat isn't set up yet, so nothing is recorded. Set it up in Website chat first."
      : "Visitor tracking is off for this store, so new visits are not recorded. Visitors who chatted still show here." }),
    " ",
    h("button", { type: "button", class: "btn btn-sm", onclick: () => openTrackingSettings() }, tr.widget ? "Turn it on" : "Open Website chat"),
  );
}

function openTrackingSettings() {
  ctx.showView("chatwidget");
  setTimeout(() => ctx.$("tracking-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
}

function paintStores(stores) {
  const { $, h } = ctx;
  const select = $("visitors-filters").store;
  const list = Array.isArray(stores) ? stores : [];
  const keep = select.value;
  select.replaceChildren(h("option", { value: "", text: "This store" }), h("option", { value: "all", text: "All stores" }), ...list.map((s) => h("option", { value: s.id, text: s.name })));
  select.value = [...select.options].some((o) => o.value === keep) ? keep : "";
  select.hidden = list.length < 2 && !t.data?.canSeeAll;
}

function paintStats(s) {
  const { $, h } = ctx;
  const pct = (n) => (s.people ? `${Math.round((n / s.people) * 100)}% of visitors` : "");
  const cards = [
    ["c-rose", "Visitors", s.people || 0, `${(s.page_views || 0).toLocaleString()} pages viewed`, ""],
    ["c-green", "Identified", s.identified || 0, pct(s.identified || 0), "identified"],
    ["c-amber", "Unverified", s.unverified || 0, pct(s.unverified || 0), "unverified"],
    ["c-slate", "Anonymous", s.anonymous || 0, pct(s.anonymous || 0), "anonymous"],
    ["c-violet", "Came back", s.returning || 0, pct(s.returning || 0), "returning"],
    ["c-orange", "Looked at cars", s.car_shoppers || 0, pct(s.car_shoppers || 0), "cars"],
  ];
  $("visitors-stats").replaceChildren(...cards.map(([cls, label, n, sub, filter]) => h("button", {
    type: "button", class: `dash-card ${cls}`, title: filter ? `Show only: ${label}` : "Show everyone",
    onclick: () => {
      const form = $("visitors-filters");
      form.status.value = STATUS[filter] ? filter : "";
      form.cars.checked = filter === "cars";
      form.returning.checked = filter === "returning";
      readFilters();
      t.page = 1;
      load();
    },
  }, h("span", { text: label }), h("strong", { text: Number(n).toLocaleString() }), h("em", { text: sub }))));
}

function paintCars(cars) {
  const { $, h } = ctx;
  $("visitors-cars").replaceChildren(...(cars.length ? cars.map((c) => h("button", {
    type: "button", class: "vis-car", title: "Show visitors who looked at this car",
    onclick: () => { const form = $("visitors-filters"); form.search.value = c.vin; readFilters(); t.page = 1; load(); },
  },
  c.vehicle?.image ? h("img", { src: c.vehicle.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : h("span", { class: "vis-car-ph", "aria-hidden": "true" }),
  h("span", { class: "vis-car-text" }, h("strong", { text: carTitle(c.vehicle, c.vin) }), h("small", { class: "mono", text: c.vin })),
  h("span", { class: "vis-car-n" }, h("strong", { text: String(c.views) }), h("small", { text: `${c.visitors} ${c.visitors === 1 ? "visitor" : "visitors"}` })))) : [h("p", { class: "muted", text: "No car pages viewed yet." })]));
}

/** A bar of the given width (set through the style object: the page's security policy blocks style="" attributes). */
function bar(percent) {
  const i = document.createElement("i");
  i.style.width = `${percent}%`;
  return i;
}

function paintKinds(kinds) {
  const { $, h } = ctx;
  const max = Math.max(1, ...kinds.map((k) => k.count));
  $("visitors-kinds").replaceChildren(...(kinds.length ? kinds.map((k) => h("div", { class: "vis-kind" },
    h("span", { class: `vis-kdot ${KIND_CLASS[k.kind] || ""}`, "aria-hidden": "true" }),
    h("span", { class: "vis-klabel", text: k.label }),
    h("span", { class: "vis-kbar" }, bar(Math.max(4, Math.round((k.count / max) * 100)))),
    h("strong", { text: k.count.toLocaleString() }))) : [h("p", { class: "muted", text: "No pages recorded yet." })]));
}

function statusTag(status, confidence) {
  const s = STATUS[status] || STATUS.anonymous;
  return ctx.h("span", { class: s.cls, title: `${s.hint}${confidence ? ` · ${confidence}% sure` : ""}`, text: s.label });
}

function header(columns) {
  const { h } = ctx;
  return columns.map(([key, label]) => {
    if (!key) return h("th", { text: label });
    const active = t.sort === key;
    const go = () => { if (t.sort === key) t.dir = t.dir === "asc" ? "desc" : "asc"; else { t.sort = key; t.dir = key === "name" ? "asc" : "desc"; } t.page = 1; load(); };
    return h("th", { class: `sortable${active ? ` sorted-${t.dir}` : ""}`, tabindex: "0", "aria-sort": active ? (t.dir === "asc" ? "ascending" : "descending") : "none", onclick: go, onkeydown: (e) => { if (e.key === "Enter") go(); } }, label);
  });
}

function paintTable(data) {
  const { $, h } = ctx;
  const many = data.items.some((i) => i.storeName) || t.filters.store === "all";
  const columns = [["name", "Visitor"], [null, "Status"], [null, "Contact"], ["visits", "Visits"], ["pages", "Pages"], ["cars", "Cars"], ["last", "Last visit"], [null, "Last page"],
    ...(many ? [[null, "Store"]] : []), [null, ""]];
  $("visitors-head").replaceChildren(...header(columns));
  $("visitors-body").replaceChildren(...(data.items.length ? data.items.map((v) => h("tr", { class: "vis-row", onclick: (e) => { if (!e.target.closest("a,button")) openVisitor(v); } },
    h("td", {}, h("div", { class: "vis-who" },
      h("span", { class: `vis-av ${v.status}`, "aria-hidden": "true", text: v.name ? v.name.slice(0, 1).toUpperCase() : "?" }),
      h("span", {}, h("strong", { text: v.label }),
        v.possibly?.name ? h("small", { class: "muted", text: `possibly ${v.possibly.name}` }) : v.device || v.browsers > 1 ? h("small", { class: "muted", text: [v.device, v.browsers > 1 ? `${v.browsers} browsers` : ""].filter(Boolean).join(" · ") }) : null))),
    h("td", {}, statusTag(v.status, v.confidence)),
    h("td", { class: "vis-contact" }, v.email ? h("div", { text: v.email }) : null, v.phone ? h("div", { class: "muted", text: `+${v.phone}` }) : null, !v.email && !v.phone ? h("span", { class: "muted", text: "—" }) : null),
    h("td", { class: "num", text: String(v.visits) }),
    h("td", { class: "num", text: String(v.pageViews) }),
    h("td", { class: "num" }, v.carViews ? h("strong", { text: String(v.carViews) }) : h("span", { class: "muted", text: "0" })),
    h("td", { title: dateTime(v.lastSeenAt), text: ago(v.lastSeenAt) }),
    h("td", { class: "vis-last" }, v.lastPage ? h("a", { href: v.lastPage, target: "_blank", rel: "noopener noreferrer", text: v.lastPageTitle || hostOf(v.lastPage) || v.lastPage }) : h("span", { class: "muted", text: "—" })),
    many ? h("td", { text: v.storeName || "" }) : null,
    h("td", { class: "records-actions" }, h("button", { type: "button", class: "btn btn-sm", onclick: () => openVisitor(v) }, "View")),
  )) : [h("tr", {}, h("td", { colspan: String(columns.length), class: "muted records-empty", text: Object.values(t.filters).some(Boolean) ? "No visitors match these filters." : "No visitors yet. They appear here as soon as tracking is on and someone opens your website." }))]));
  const start = (t.page - 1) * t.perPage + 1;
  $("visitors-count").textContent = data.total ? `Showing ${start} to ${start + data.items.length - 1} of ${data.total} visitors` : "Showing 0 visitors";
  const pages = Math.max(1, Math.ceil((data.total || 0) / t.perPage));
  const go = (p) => { t.page = p; load(); };
  const nums = [];
  for (let p = Math.max(1, t.page - 2); p <= Math.min(pages, t.page + 2); p += 1) nums.push(p);
  $("visitors-pager").replaceChildren(
    h("button", { type: "button", class: "btn btn-sm", disabled: t.page <= 1, onclick: () => go(t.page - 1), "aria-label": "Previous page" }, "←"),
    ...nums.map((p) => h("button", { type: "button", class: `btn btn-sm${p === t.page ? " btn-primary" : ""}`, onclick: () => go(p) }, String(p))),
    h("button", { type: "button", class: "btn btn-sm", disabled: t.page >= pages, onclick: () => go(t.page + 1), "aria-label": "Next page" }, "→"),
  );
}

function paintExport(data) {
  const box = ctx.$("visitors-export");
  box.hidden = !data.canExport;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(t.filters)) if (v) params.set(k, v);
  for (const a of box.querySelectorAll("a[data-export]")) {
    const p = new URLSearchParams(params);
    p.set("kind", a.dataset.export);
    p.set("format", a.dataset.format);
    a.href = `/api/visitors/export?${p}`;
  }
}

// ---------- one visitor ----------
async function openVisitor(v) {
  const { $ } = ctx;
  try {
    const store = t.filters.store ? `?store=${encodeURIComponent(t.filters.store)}` : "";
    const data = await ctx.api(`/api/visitors/${encodeURIComponent(v.widgetId)}/${encodeURIComponent(v.personId)}${store}`);
    paintVisitor(data);
    if (!$("visitor-dialog").open) $("visitor-dialog").showModal();
  } catch (error) {
    ctx.toast(error.message, "error");
  }
}

function kv(rows) {
  const { h } = ctx;
  return h("dl", { class: "kv" }, ...rows.filter(([, v]) => v !== "" && v !== null && v !== undefined && v !== false)
    .flatMap(([k, v]) => [h("dt", { text: k }), h("dd", {}, v instanceof Node ? v : String(v))]));
}

function paintVisitor(d) {
  const { $, h } = ctx;
  const p = d.person;
  $("visitor-title").replaceChildren(h("span", { text: p.label }), " ", statusTag(p.status, p.confidence));
  const nodes = [];
  // Who
  const who = [
    ["Name", p.name], ["E-mail", p.email], ["Phone", p.phone ? `+${p.phone}` : ""], ["Zip", p.zip],
    ["How we know", p.status === "identified" ? `${d.sources[p.source] || p.source} (${p.confidence}% sure)` : p.status === "unverified" ? `${d.sources[p.source] || p.source} (${p.confidence}% sure)` : "Not yet: anonymous"],
    ["Identified on", p.identifiedAt ? dateTime(p.identifiedAt) : ""],
    ["In the CRM", d.crm === "known" ? "Yes, a known customer or lead" : d.crm === "new" ? "No, a new lead" : ""],
    ["Store", d.storeName],
    ["Visitor ID", h("span", { class: "mono", text: p.personId })],
  ];
  nodes.push(h("div", { class: "vis-section" }, h("h4", { text: "Who" }), kv(who)));
  if (p.possibly) {
    nodes.push(h("p", { class: "callout warn" },
      h("strong", { text: "Unverified: " }),
      `this browser looked up ${[p.possibly.name, p.possibly.email, p.possibly.phone ? `+${p.possibly.phone}` : ""].filter(Boolean).join(" · ")} in the chat but did not confirm it. Anyone can type someone else's e-mail, so treat it as a hint only. It is never exported.`));
  }
  // Numbers
  nodes.push(h("div", { class: "vis-mini" },
    ...[["First visit", dateTime(p.firstSeenAt)], ["Last visit", `${dateTime(p.lastSeenAt)} (${ago(p.lastSeenAt)})`], ["Visits", p.visits], ["Pages", p.pageViews], ["Cars viewed", d.cars.length], ["Time on site", duration(d.totalSeconds) || "—"]]
      .map(([k, v]) => h("div", {}, h("span", { text: k }), h("strong", { text: String(v) })))));
  // Cars
  if (d.cars.length) {
    nodes.push(h("div", { class: "vis-section" }, h("h4", { text: `Cars viewed (${d.cars.length})` }), h("div", { class: "vis-cars" }, ...d.cars.map((c) => h("a", { class: "vis-car", href: c.url, target: "_blank", rel: "noopener noreferrer" },
      c.vehicle?.image ? h("img", { src: c.vehicle.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : h("span", { class: "vis-car-ph", "aria-hidden": "true" }),
      h("span", { class: "vis-car-text" }, h("strong", { text: carTitle(c.vehicle, c.vin) }), h("small", {}, h("span", { class: "mono", text: c.vin }), c.vehicle?.price ? ` · ${money(c.vehicle.price)}` : "")),
      h("span", { class: "vis-car-n" }, h("strong", { text: `${c.views}×` }), h("small", { text: [duration(c.seconds), ago(c.lastAt)].filter(Boolean).join(" · ") })))))));
  }
  // What they look at
  if (d.kinds.length) {
    nodes.push(h("div", { class: "vis-section" }, h("h4", { text: "What they look at" }), h("div", { class: "vis-chips" },
      ...d.kinds.map((k) => h("span", { class: `vis-chip ${KIND_CLASS[k.kind] || ""}`, text: `${k.label} · ${k.count}` })))));
  }
  // Visits and pages
  nodes.push(h("div", { class: "vis-section" }, h("h4", { text: `Visits (${d.visits.length})` }),
    d.visits.length ? h("ol", { class: "vis-timeline" }, ...d.visits.map((v) => h("li", {},
      h("div", { class: "vis-visit" },
        h("strong", { text: `Visit ${v.number}` }),
        h("span", { class: "muted", text: [dateTime(v.startedAt), `${v.pages.length} ${v.pages.length === 1 ? "page" : "pages"}`, duration(v.seconds), v.referrer ? `from ${hostOf(v.referrer)}` : "", d.browsers.length > 1 ? `browser ${v.browser}` : ""].filter(Boolean).join(" · ") })),
      h("ul", { class: "vis-pages" }, ...v.pages.map((pg) => h("li", {},
        h("span", { class: "vis-time", text: timeOnly(pg.at) }),
        h("span", { class: `vis-chip ${KIND_CLASS[pg.kind] || ""}`, text: pg.kindLabel }),
        h("a", { href: pg.url, target: "_blank", rel: "noopener noreferrer", text: pg.vin ? carTitle(pg.vehicle, pg.vin) : pg.title || pg.url }),
        pg.vehicle?.price ? h("span", { class: "muted", text: money(pg.vehicle.price) }) : null,
        pg.seconds ? h("span", { class: "muted", text: duration(pg.seconds) }) : null)))))) : h("p", { class: "muted", text: "No pages recorded (tracking was off, or the visitor turned it off)." })));
  // Browsers
  nodes.push(h("div", { class: "vis-section" }, h("h4", { text: d.browsers.length > 1 ? `Browsers and devices (${d.browsers.length}, joined by e-mail or phone)` : "Browser and device" }),
    ...d.browsers.map((b) => kv([
      [d.browsers.length > 1 ? `Browser ${b.number}` : "Device", [b.device, b.screen, b.language, b.timezone].filter(Boolean).join(" · ") || "—"],
      ["First came from", b.firstReferrer ? hostOf(b.firstReferrer) || b.firstReferrer : "Direct / unknown"],
      ["First page", b.landing], ["Campaign", b.campaign],
      ["Seen", `${dateTime(b.firstSeenAt)} → ${dateTime(b.lastSeenAt)}`],
    ]))));
  // Leads
  if (d.leads.length) {
    nodes.push(h("div", { class: "vis-section" }, h("h4", { text: `Leads (${d.leads.length})` }), h("ul", { class: "vis-leads" },
      ...d.leads.map((l) => h("li", { text: `#${l.id} · ${l.car || "No car"}${l.vin ? ` (${l.vin})` : ""} · ${dateTime(l.createdAt)}` })))));
  }
  $("visitor-body").replaceChildren(...nodes);
  $("visitor-actions").replaceChildren(...[
    p.chatKey ? h("button", { type: "button", class: "btn btn-primary", onclick: async () => { $("visitor-dialog").close(); ctx.showView("inbox"); await ctx.openContact(p.chatKey); } }, "Open chat") : null,
    d.canExport ? h("button", { type: "button", class: "btn btn-danger", onclick: () => deleteVisitor(p) }, "Delete this visitor's data") : null,
    h("button", { class: "btn", value: "close" }, "Close"),
  ].filter(Boolean));
}

async function deleteVisitor(p) {
  const ok = await ctx.confirmDialog({
    title: "Delete this visitor's data?",
    text: "Deletes every page and car this visitor looked at and how we know them (for a privacy request). Their chats stay in the Inbox. This cannot be undone.",
    okLabel: "Delete",
  });
  if (!ok) return;
  try {
    const store = t.filters.store ? `?store=${encodeURIComponent(t.filters.store)}` : "";
    const res = await ctx.api(`/api/visitors/${encodeURIComponent(p.widgetId)}/${encodeURIComponent(p.personId)}${store}`, { method: "DELETE" });
    ctx.$("visitor-dialog").close();
    ctx.toast(`Deleted: ${res.pages} pages from ${res.browsers} ${res.browsers === 1 ? "browser" : "browsers"}`, "success");
    load();
  } catch (error) {
    ctx.toast(error.message, "error");
  }
}

// ---------- Website chat → Visitor tracking ----------
/** Called when the Website chat page opens. */
export async function loadTrackingPanel() {
  const { $ } = ctx;
  const panel = $("tracking-panel");
  if (!panel) return;
  try {
    const data = await ctx.api("/api/store-widget");
    tracking = { settings: data.tracking, options: data.trackingOptions, canEdit: Boolean(data.canEdit) };
    const form = $("tracking-form");
    const s = data.tracking;
    for (const r of form.querySelectorAll('input[name="mode"]')) r.checked = r.value === s.mode;
    form.notice.value = s.notice || "";
    form.privacyUrl.value = s.privacyUrl || "";
    form.retentionDays.value = s.retentionDays;
    form.honorDnt.checked = s.honorDnt !== false;
    form.sites.value = (s.sites || []).join("\n");
    for (const el of form.elements) if (el.tagName !== "BUTTON" || el.type === "submit") el.disabled = !tracking.canEdit;
    $("tracking-error").hidden = true;
    // Switched off by AutoPulse (Store controls): say so; the choice here takes effect when it is allowed again.
    if (data.controls?.tracking === false) {
      $("tracking-error").textContent = "AutoPulse has switched visitor tracking off for this store, so nothing is recorded whatever you choose here.";
      $("tracking-error").hidden = false;
    }
    paintTrackingState();
    panel.hidden = false;
  } catch {
    panel.hidden = true;
  }
}

function paintTrackingState() {
  const form = ctx.$("tracking-form");
  const mode = form.querySelector('input[name="mode"]:checked')?.value || "off";
  ctx.$("tracking-panel").classList.toggle("vt-off", mode === "off");
  for (const label of form.querySelectorAll(".vt-mode")) label.classList.toggle("on", label.querySelector("input").checked);
}

async function saveTracking(e) {
  e.preventDefault();
  const { $ } = ctx;
  const form = $("tracking-form");
  const err = $("tracking-error");
  err.hidden = true;
  const body = {
    mode: form.querySelector('input[name="mode"]:checked')?.value || "off",
    notice: form.notice.value, privacyUrl: form.privacyUrl.value.trim(), retentionDays: Number(form.retentionDays.value), honorDnt: form.honorDnt.checked,
    sites: form.sites.value.split(/[\s,]+/).filter(Boolean),
  };
  const btn = $("tracking-save");
  btn.disabled = true;
  try {
    const res = await ctx.api("/api/store-widget", { method: "POST", body: { tracking: body } });
    tracking.settings = res.tracking;
    form.sites.value = (res.tracking.sites || []).join("\n");
    ctx.toast(res.tracking.mode === "off" ? "Visitor tracking is off" : "Visitor tracking saved. Your website picks it up within 5 minutes.", "success");
  } catch (error) {
    err.textContent = error.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}
