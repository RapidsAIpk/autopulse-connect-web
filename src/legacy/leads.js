// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/leads.js — edit the port script, not this file.
// Leads and Appointments views (same tabs and columns as the AutoPulse chatbot admin), plus
// "Save lead" / "Book visit" from a chat and the dealership's ADF e-mail setting.
let ui = null; // helpers passed in from app.js

const SOURCE_LABELS = {
  facebook_messenger: "Facebook", messenger: "Facebook", website: "Website", direct: "Direct",
  whatsapp: "WhatsApp", twilio: "WhatsApp", sms: "SMS", instagram: "Instagram", manual: "Added by staff", import: "Imported",
};
const sourceLabel = (value) => SOURCE_LABELS[value] || (value ? value[0].toUpperCase() + value.slice(1) : "Direct");

const day = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");
const dateTime = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const money = (n) => (Number.isFinite(n) && n > 0 ? `$${Math.round(n).toLocaleString()}` : "");
const miles = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString()} mi` : "");
function time12(value) {
  const [hh, mm] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return value || "";
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
}

function makeTable(kind) {
  return { kind, page: 1, perPage: 10, sort: "date", dir: "desc", filters: {}, admin: false, loading: 0, mode: "people", vin: "" };
}
const tables = { leads: makeTable("leads"), appts: makeTable("appts"), convs: makeTable("convs"), veh: { ...makeTable("veh"), perPage: 25 } };

function query(t, extra = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...t.filters, vin: t.vin, page: t.page, perPage: t.perPage, sort: t.sort, dir: t.dir, ...extra })) {
    if (v !== "" && v !== undefined && v !== null) params.set(k, v);
  }
  return params.toString();
}

function exportQuery(t) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...t.filters, vin: t.vin })) if (v) params.set(k, v);
  return params.toString();
}

// ---------- shared table pieces ----------

function header(t, columns) {
  const { h } = ui;
  return columns.map(([key, label]) => {
    if (!key) return h("th", { text: label });
    const active = t.sort === key;
    return h("th", {
      class: `sortable${active ? ` sorted-${t.dir}` : ""}`,
      tabindex: "0",
      "aria-sort": active ? (t.dir === "asc" ? "ascending" : "descending") : "none",
      onclick: () => resort(t, key),
      onkeydown: (e) => { if (e.key === "Enter") resort(t, key); },
    }, label);
  });
}

function resort(t, key) {
  if (t.sort === key) t.dir = t.dir === "asc" ? "desc" : "asc";
  else { t.sort = key; t.dir = key === "date" ? "desc" : "asc"; }
  t.page = 1;
  reload(t);
}

function pager(t, total, el) {
  const { h } = ui;
  const pages = Math.max(1, Math.ceil(total / t.perPage));
  const go = (p) => { t.page = p; reload(t); };
  const nums = [];
  for (let p = Math.max(1, t.page - 2); p <= Math.min(pages, t.page + 2); p += 1) nums.push(p);
  el.replaceChildren(
    h("button", { type: "button", class: "btn btn-sm", disabled: t.page <= 1, onclick: () => go(t.page - 1), "aria-label": "Previous page" }, "←"),
    ...nums.map((p) => h("button", { type: "button", class: `btn btn-sm${p === t.page ? " btn-primary" : ""}`, onclick: () => go(p) }, String(p))),
    h("button", { type: "button", class: "btn btn-sm", disabled: t.page >= pages, onclick: () => go(t.page + 1), "aria-label": "Next page" }, "→"),
  );
}

function countText(t, total, shown) {
  if (!total) return "Showing 0 records";
  const start = (t.page - 1) * t.perPage + 1;
  return `Showing ${start} to ${start + shown - 1} of ${total} records`;
}

function emptyRow(colspan, text) {
  return ui.h("tr", {}, ui.h("td", { colspan: String(colspan), class: "muted records-empty", text }));
}

function actionButtons(...buttons) {
  return ui.h("td", { class: "records-actions" }, ...buttons.filter(Boolean));
}

function iconButton(label, path, onclick, extra = "") {
  const { h } = ui;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", path);
  svg.append(p);
  return h("button", { type: "button", class: `icon-btn${extra ? ` ${extra}` : ""}`, title: label, "aria-label": label, onclick }, svg);
}
const EYE = "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z";
const CHAT = "M4 5h16v10h-9l-5 4v-4H4z";
const BIN = "M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13";
const ERASE_PERSON = "M9.5 8.5a3 3 0 1 0 0-.01M3.5 19.5c.6-3.3 3-5.2 6-5.2 1.6 0 3 .5 4.1 1.4M16 10l5 5M21 10l-5 5";

async function openChat(phone) {
  if (!phone) return;
  ui.showView("inbox");
  await ui.openContact(phone);
}

async function confirmDelete(what, url, t) {
  const ok = await ui.confirmDialog({ title: `Delete this ${what}?`, text: "This cannot be undone.", okLabel: "Delete" });
  if (!ok) return;
  try {
    await ui.api(url, { method: "DELETE" });
    ui.toast(`${what[0].toUpperCase()}${what.slice(1)} deleted`, "success");
    reload(t);
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

function detailList(rows) {
  const { h } = ui;
  return h("dl", { class: "kv" }, ...rows.filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .flatMap(([k, v]) => [h("dt", { text: k }), h("dd", {}, v instanceof Node ? v : String(v))]));
}

function showRecord(title, nodes, { phone } = {}) {
  const { h, $ } = ui;
  $("record-title").textContent = title;
  $("record-body").replaceChildren(...nodes);
  const actions = $("record-actions");
  actions.replaceChildren(...[
    phone ? h("button", { type: "button", class: "btn btn-primary", onclick: () => { $("record-dialog").close(); openChat(phone); } }, "Open chat") : null,
    h("button", { class: "btn", value: "close" }, "Close"),
  ].filter(Boolean));
  if (!$("record-dialog").open) $("record-dialog").showModal();
}

// ---------- leads ----------

const LEAD_COLUMNS = (admin) => [
  ["car", "Car"], ["vin", "VIN"], ["name", "Name"], ["zip", "Zip"], ["email", "Email"], ["phone", "Phone"],
  ...(admin ? [["dealer", "Dealer Name"]] : []), ["date", "Date"], [null, "Action"],
];

async function loadLeads() {
  const t = tables.leads;
  const seq = ++t.loading;
  try {
    const data = await ui.api(`/api/leads${t.mode === "cars" ? "/by-car" : ""}?${query(t)}`);
    if (seq !== t.loading) return;
    t.admin = Boolean(data.admin);
    fillStorePick(data.stores);
    syncVinChip(t);
    if (t.mode === "cars") paintCars(t, data);
    else paintLeads(t, data);
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

function showSeeAll(allowed) {
  for (const el of document.querySelectorAll(".see-all")) el.hidden = !allowed;
}

/** Store pickers (Leads, Appointments, Vehicles): "This store", "All stores" and each store the person may see. */
function fillStorePick(stores) {
  const { h } = ui;
  const list = Array.isArray(stores) ? stores : [];
  for (const select of document.querySelectorAll(".store-pick")) {
    const keep = select.value;
    select.replaceChildren(
      h("option", { value: "", text: "This store" }),
      h("option", { value: "all", text: "All stores" }),
      ...list.map((st) => h("option", { value: st.id, text: st.name })),
    );
    select.value = [...select.options].some((o) => o.value === keep) ? keep : "";
    select.hidden = list.length < 2;
  }
}

function syncVinChip(t) {
  const { h, $ } = ui;
  const chip = $("leads-vin-chip");
  chip.hidden = !t.vin;
  chip.replaceChildren(...(t.vin ? [
    h("span", { text: `Car ${t.vin}` }),
    h("button", { type: "button", class: "icon-btn", "aria-label": "Show all cars", title: "Show all cars", onclick: () => { t.vin = ""; t.page = 1; loadLeads(); } }, "×"),
  ] : []));
}

function setLeadsMode(mode) {
  const t = tables.leads;
  if (t.mode === mode) return;
  t.mode = mode;
  t.page = 1;
  t.sort = "date";
  t.dir = "desc";
  for (const btn of document.querySelectorAll("[data-leads-mode]")) {
    const on = btn.dataset.leadsMode === mode;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", String(on));
  }
  loadLeads();
}

function unlistedBadge(at) {
  return at ? ui.h("span", { class: "tag tag-warn", title: `Not on the lot since ${day(at)}`, text: "No longer listed" }) : null;
}

const CAR_COLUMNS = (admin) => [
  ["car", "Car"], ["vin", "VIN"], ["count", "Leads"], [null, "Not opened"], ...(admin ? [[null, "Dealer Name"]] : []),
  ["date", "Latest lead"], [null, "Status"], [null, "Action"],
];

function paintCars(t, data) {
  const { h, $ } = ui;
  const columns = CAR_COLUMNS(t.admin);
  $("leads-head").replaceChildren(...header(t, columns));
  $("leads-body").replaceChildren(...(data.items.length ? data.items.map((row) => h("tr", {},
    h("td", {}, h("div", { class: "car-cell" },
      row.vehicle?.image ? h("img", { src: row.vehicle.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
      h("span", { text: row.car || "—" }))),
    h("td", { class: "mono", text: row.vin }),
    h("td", {}, h("strong", { text: String(row.count) })),
    h("td", { text: row.unviewed ? String(row.unviewed) : "—" }),
    t.admin ? h("td", { text: row.dealerName }) : null,
    h("td", { text: day(row.latestAt) }),
    h("td", {}, unlistedBadge(row.vehicleUnlistedAt) || h("span", { class: "muted", text: "On the lot" })),
    actionButtons(
      iconButton("View car", CAR, () => openCar(row.leadId)),
      h("button", { type: "button", class: "btn btn-sm", onclick: () => { t.vin = row.vin; t.page = 1; setLeadsMode("people"); loadLeads(); } }, "Show leads"),
    ),
  )) : [emptyRow(columns.length, "No leads with a car yet.")]));
  $("leads-count").textContent = countText(t, data.total, data.items.length).replace("records", "cars");
  pager(t, data.total, $("leads-pager"));
  $("leads-csv").href = `/api/leads/export?${exportQuery(t)}`;
}

const CAR = "M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2h3v-2M17 16v2h3v-2M7.5 13h.01M16.5 13h.01";

async function openCar(leadId) {
  try {
    showCar(await ui.api(`/api/leads/${leadId}/vehicle`));
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

/** Car pop-up shared by Leads and Vehicles. `extra` goes above the car, `actions` before Close. */
function showCar(data, { extra = [], actions = [] } = {}) {
  const { h, $ } = ui;
    const v = data.vehicle || {};
    const snap = data.snapshot || {};
    const nodes = [];
    if (!data.listed) {
      const title = [snap.year, snap.make, snap.model, snap.trim].filter(Boolean).join(" ") || `VIN ${snap.vin}`;
      nodes.push(
        h("h3", { text: title }),
        h("p", { class: "callout warn", text: data.available
          ? "This car is no longer listed on the dealer's lot. It was probably sold. The details below are what the customer saw."
          : "Live stock could not be reached right now. The details below are what the customer saw." }),
        detailList([["VIN", snap.vin], ["Price", money(snap.price)], ["Mileage", miles(snap.miles)], ["Transmission", snap.transmission], ["Fuel", snap.fuelType]]),
      );
    } else {
      const photos = v.photos || [];
      const gallery = h("div", { class: "car-gallery" });
      const main = photos.length ? h("img", { class: "car-main", src: photos[0], alt: v.title, referrerpolicy: "no-referrer" }) : null;
      if (main) gallery.append(main);
      if (photos.length > 1) {
        gallery.append(h("div", { class: "car-thumbs" }, ...photos.map((src) => h("button", { type: "button", class: "car-thumb", onclick: () => { main.src = src; } },
          h("img", { src, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })))));
      }
      const flags = [v.certified && "Certified", v.carfaxOneOwner && "Carfax 1-owner", v.carfaxCleanTitle && "Clean title", v.inventoryType && v.inventoryType.toUpperCase()].filter(Boolean);
      nodes.push(
        gallery,
        h("div", { class: "car-headline" },
          h("div", {}, h("h3", { text: v.title }), h("div", { class: "muted", text: [v.exteriorColor, v.bodyType, v.drivetrain].filter(Boolean).join(" · ") })),
          h("div", { class: "car-price" }, h("strong", { text: money(v.price) || "Price N/A" }), v.msrp && v.msrp !== v.price ? h("span", { class: "muted", text: `MSRP ${money(v.msrp)}` }) : null)),
        flags.length ? h("div", { class: "car-flags" }, ...flags.map((f) => h("span", { class: "tag", text: f }))) : null,
        h("h4", { text: "Specifications" }),
        detailList([
          ["VIN", v.vin], ["Mileage", miles(v.miles)], ["Engine", v.engine], ["Transmission", v.transmission], ["Drivetrain", v.drivetrain],
          ["Fuel", v.fuelType], ["MPG", v.cityMpg || v.highwayMpg ? `${v.cityMpg ?? "?"} city / ${v.highwayMpg ?? "?"} hwy` : ""],
          ["Doors", v.doors || ""], ["Cylinders", v.cylinders || ""], ["Exterior", v.exteriorColor], ["Interior", v.interiorColor], ["Days on lot", v.daysOnLot],
        ]),
      );
      if ((v.features || []).length) {
        const byCat = new Map();
        for (const f of v.features) {
          if (!byCat.has(f.category)) byCat.set(f.category, []);
          byCat.get(f.category).push(f.description);
        }
        nodes.push(h("h4", { text: "Features" }), h("div", { class: "car-features" },
          ...[...byCat].map(([cat, list]) => h("div", {}, h("strong", { text: cat }), h("ul", {}, ...list.map((d) => h("li", { text: d })))))));
      }
      if (data.dealer?.name) {
        nodes.push(h("h4", { text: "Dealer" }), detailList([["Name", data.dealer.name], ["Address", data.dealer.address], ["Phone", data.dealer.phone]]));
      }
      if ((data.similar || []).length) {
        nodes.push(h("h4", { text: "Similar cars on the lot" }), h("div", { class: "car-similar" },
          ...data.similar.map((c) => h(c.url ? "a" : "div", { class: "car-similar-item", ...(c.url ? { href: c.url, target: "_blank", rel: "noopener noreferrer" } : {}) },
            c.image ? h("img", { src: c.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
            h("strong", { text: c.title }),
            h("span", { class: "muted", text: [money(c.price) || "Call for price", miles(c.miles)].filter(Boolean).join(" · ") })))));
      }
    }
    $("car-body").replaceChildren(...[...extra, ...nodes].filter(Boolean));
    $("car-actions").replaceChildren(...[
      ...actions,
      v.url ? h("a", { class: "btn", href: v.url, target: "_blank", rel: "noopener noreferrer" }, "Open on dealer site") : null,
      h("button", { class: "btn btn-primary", value: "close" }, "Close"),
    ].filter(Boolean));
    if (!$("car-dialog").open) $("car-dialog").showModal();
}

function paintLeads(t, data) {
  const { h, $ } = ui;
  const columns = LEAD_COLUMNS(t.admin);
  $("leads-head").replaceChildren(...header(t, columns));
  const body = $("leads-body");
  body.replaceChildren(...(data.items.length ? data.items.map((lead) => h("tr", { class: lead.viewed ? "" : "unviewed" },
    h("td", {}, lead.viewed ? null : h("span", { class: "new-dot", title: "Not opened yet" }), lead.car || h("span", { class: "muted", text: "—" }), unlistedBadge(lead.vehicleUnlistedAt)),
    h("td", { class: "mono", text: lead.vehicle?.vin || "" }),
    h("td", { text: lead.name }),
    h("td", { text: lead.zip }),
    h("td", { text: lead.email }),
    h("td", { text: lead.phone }),
    t.admin ? h("td", { text: lead.dealerName }) : null,
    h("td", { text: day(lead.createdAt) }),
    actionButtons(
      iconButton("View lead", EYE, () => viewLead(lead.id)),
      lead.chatKey ? iconButton("Open chat", CHAT, () => openChat(lead.chatKey)) : null,
      t.admin ? iconButton("Delete lead", BIN, () => confirmDelete("lead", `/api/leads/${lead.id}`, t), "danger") : null,
      lead.chatKey && ui.isSuperAdmin?.() ? iconButton("Delete all of this customer's data", ERASE_PERSON, async () => { if (await ui.eraseCustomer(lead.chatKey)) reload(t); }, "danger erase") : null,
    ),
  )) : [emptyRow(columns.length, "No leads yet. Leads appear when a customer taps “I'm Interested” on a car, or when you save one from a chat.")]));
  $("leads-count").textContent = countText(t, data.total, data.items.length);
  pager(t, data.total, $("leads-pager"));
  $("leads-csv").href = `/api/leads/export?${exportQuery(t)}`;
}

async function viewLead(id) {
  const { h } = ui;
  try {
    const { lead } = await ui.api(`/api/leads/${id}`);
    const v = lead.vehicle || {};
    const carTitle = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
    const car = h("div", { class: "record-car" },
      v.image ? h("img", { src: v.image, alt: carTitle || "Vehicle", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
      h("div", {},
        h("strong", { text: carTitle || (v.vin ? `VIN ${v.vin}` : "No car on this lead") }),
        h("div", { class: "muted", text: [v.year, v.fuelType, v.transmission].filter(Boolean).join(" | ") }),
        h("div", { class: "record-price", text: money(v.price) || (carTitle ? "Price N/A" : "") }),
        v.url ? h("a", { href: v.url, target: "_blank", rel: "noopener noreferrer", text: "View on the dealer's site" }) : null));
    showRecord("Lead details", [
      h("h4", { text: "Customer details" }),
      detailList([["Name", lead.name], ["Phone", lead.phone], ["Email", lead.email], ["Zip", lead.zip]]),
      h("h4", { text: "Vehicle" }),
      car,
      detailList([["VIN", v.vin], ["Mileage", miles(v.miles)], ["Drivetrain", v.drivetrain], ["Body", v.bodyType],
        ["On the lot", lead.vehicleUnlistedAt ? `No — not listed since ${day(lead.vehicleUnlistedAt)}` : (v.vin ? "Yes, as of the last daily check" : "")]]),
      v.vin ? h("button", { type: "button", class: "btn btn-sm", onclick: () => { ui.$("record-dialog").close(); openCar(lead.id); } }, "View full car page") : null,
      h("h4", { text: "Lead" }),
      detailList([
        ["Dealer", lead.dealerName], ["Website", lead.dealerSource], ["Source", sourceLabel(lead.source)],
        ["Created", dateTime(lead.createdAt)],
        ["ADF e-mail", lead.adfSentAt ? `Sent ${dateTime(lead.adfSentAt)}` : (lead.adfError || "Waiting")],
      ]),
    ].filter(Boolean), { phone: lead.chatKey });
    reload(tables.leads);
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

// ---------- appointments ----------

const APPT_COLUMNS = (admin) => [
  ["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["bookingDate", "Booking Date"], ["bookingTime", "Booking Time"],
  ["source", "Source"], [null, "Tracking Data"], ...(admin ? [["dealer", "Dealer Name"]] : []), ["date", "Date"], [null, "Actions"],
];

async function loadAppointments() {
  const t = tables.appts;
  const seq = ++t.loading;
  try {
    const data = await ui.api(`/api/appointments?${query(t)}`);
    if (seq !== t.loading) return;
    t.admin = Boolean(data.admin);
    fillStorePick(data.stores);
    paintAppointments(t, data);
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

function paintAppointments(t, data) {
  const { h, $ } = ui;
  const a = data.analytics || {};
  $("a-total").textContent = a.totalBookings ?? 0;
  $("a-month").textContent = a.thisMonthBookings ?? 0;
  $("a-fb").textContent = a.facebookVisits ?? 0;
  $("a-rate").textContent = `${Number(a.conversionRate || 0).toFixed(1)}%`;
  const columns = APPT_COLUMNS(t.admin);
  $("appts-head").replaceChildren(...header(t, columns));
  $("appts-body").replaceChildren(...(data.items.length ? data.items.map((appt) => h("tr", {},
    h("td", { text: appt.name }),
    h("td", { text: appt.email }),
    h("td", { text: appt.phone }),
    h("td", { text: appt.bookingDate }),
    h("td", { text: time12(appt.bookingTime) }),
    h("td", {}, h("span", { class: `source-tag src-${appt.source || "direct"}`, text: sourceLabel(appt.source) })),
    h("td", {}, appt.tracking
      ? h("button", { type: "button", class: "btn btn-sm", onclick: () => viewTracking(appt) }, "View")
      : h("span", { class: "muted", text: "No data" })),
    t.admin ? h("td", { text: appt.dealerName }) : null,
    h("td", { text: day(appt.createdAt) }),
    actionButtons(
      iconButton("View appointment", EYE, () => viewAppointment(appt)),
      appt.chatKey ? iconButton("Open chat", CHAT, () => openChat(appt.chatKey)) : null,
      t.admin ? iconButton("Delete appointment", BIN, () => confirmDelete("appointment", `/api/appointments/${appt.id}`, t), "danger") : null,
    ),
  )) : [emptyRow(columns.length, "No appointments yet. Book a visit from any chat with “Book visit”.")]));
  $("appts-count").textContent = countText(t, data.total, data.items.length);
  pager(t, data.total, $("appts-pager"));
  $("appts-csv").href = `/api/appointments/export?${exportQuery(t)}`;
  $("appts-tracking-csv").href = `/api/appointments/export-tracking?${exportQuery(t)}`;
}

function viewAppointment(appt) {
  const { h } = ui;
  showRecord("Booking details", [
    h("h4", { text: "Customer information" }),
    detailList([["Name", appt.name || "N/A"], ["Email", appt.email || "N/A"], ["Phone", appt.phone || "N/A"]]),
    h("h4", { text: "Booking information" }),
    detailList([
      ["Date", appt.bookingDate || "N/A"], ["Time", time12(appt.bookingTime) || "N/A"], ["Created", dateTime(appt.createdAt)],
      ["Dealer", appt.dealerName], ["Source", sourceLabel(appt.source)],
      ["Vehicle ID", appt.vehicleId], ["Vehicle", appt.vehicleTitle], ["Conversation ID", appt.conversationId],
      ["ADF e-mail", appt.adfSentAt ? `Sent ${dateTime(appt.adfSentAt)}` : (appt.adfError || "Waiting")],
    ]),
  ], { phone: appt.chatKey });
}

function viewTracking(appt) {
  const { h } = ui;
  const t = appt.tracking || {};
  const toConvert = t.visitedAt && t.convertedAt ? Math.round((Date.parse(t.convertedAt) - Date.parse(t.visitedAt)) / 60000) : null;
  showRecord("Tracking analytics", [
    h("h4", { text: "Visit information" }),
    detailList([["Visit date", t.visitedAt || "N/A"], ["Source", t.utmSource || appt.source || "N/A"], ["Session ID", t.sessionId || "N/A"], ["Status", t.status || "N/A"]]),
    h("h4", { text: "User journey" }),
    detailList([
      ["Converted", t.convertedAt || "N/A"],
      ["Time to convert", Number.isFinite(toConvert) ? `${toConvert} min` : "N/A"],
    ]),
    t.additionalData ? h("pre", { class: "record-json", text: JSON.stringify(t.additionalData, null, 2) }) : null,
  ].filter(Boolean), { phone: appt.chatKey });
}

// ---------- filters ----------

function wireFilters(t, formId, perPageId) {
  const { $ } = ui;
  const form = $(formId);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    t.filters = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
    if (t.filters.from && t.filters.to && t.filters.from > t.filters.to) {
      ui.toast("“From” must be before “To”", "error");
      return;
    }
    t.page = 1;
    reload(t);
  });
  form.querySelector("[data-reset]").addEventListener("click", () => {
    form.reset();
    t.filters = {};
    t.vin = "";
    t.page = 1;
    reload(t);
  });
  $(perPageId).addEventListener("change", (e) => {
    t.perPage = Number(e.target.value) || 10;
    t.page = 1;
    reload(t);
  });
}

function reload(t) {
  if (t.kind === "leads") return loadLeads();
  if (t.kind === "convs") return loadConversations();
  if (t.kind === "veh") return loadVehicles();
  return loadAppointments();
}

// ---------- conversations report ----------

const CHANNEL_NAMES = { website: "Website", whatsapp: "WhatsApp", twilio: "WhatsApp", sms: "SMS", messenger: "Messenger", instagram: "Instagram" };

function duration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const CONV_COLUMNS = (all) => [
  ["date", "Started"], ["name", "Customer"], [null, "Channel"], ...(all ? [[null, "Dealer Name"]] : []), [null, "First question"],
  ["messages", "Messages"], ["followUps", "Follow-ups"], ["session", "Session time"], [null, "Clicks"], [null, "Booked"], [null, "Action"],
];

async function loadConversations() {
  const t = tables.convs;
  const seq = ++t.loading;
  try {
    const data = await ui.api(`/api/conversations?${query(t)}`);
    if (seq !== t.loading) return;
    showSeeAll(data.canSeeAll);
    paintConversations(t, data);
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

function clickSummary(clicks = {}) {
  const parts = [
    clicks.viewVehicle && `${clicks.viewVehicle} viewed car`,
    clicks.visitWebsite && `${clicks.visitWebsite} visited site`,
    clicks.vinRequest && `${clicks.vinRequest} VIN request`,
    clicks.exploreMore && `${clicks.exploreMore} explore more`,
    clicks.vinCopy && `${clicks.vinCopy} copied VIN`,
    clicks.teaserOpen && `${clicks.teaserOpen} opened from pop-up`,
  ].filter(Boolean);
  return parts.join(", ");
}

function paintConversations(t, data) {
  const { h, $ } = ui;
  const sum = data.summary || {};
  $("c-chats").textContent = sum.chats ?? 0;
  $("c-messages").textContent = sum.messages ?? 0;
  $("c-session").textContent = duration(sum.sessionSeconds);
  $("c-average").textContent = duration(sum.averageSeconds);
  $("c-booked").textContent = sum.booked ?? 0;
  const wide = Boolean(t.filters.all) || data.canSeeAll;
  const columns = CONV_COLUMNS(wide);
  $("convs-head").replaceChildren(...header(t, columns));
  $("convs-body").replaceChildren(...(data.items.length ? data.items.map((row) => h("tr", {},
    h("td", { text: dateTime(row.startedAt) }),
    h("td", { text: row.name || (row.channel === "website" ? "Website visitor" : "") }),
    h("td", {}, h("span", { class: `source-tag src-${row.channel}`, text: row.source === "chatbot_messenger" ? "Messenger (chatbot)" : CHANNEL_NAMES[row.channel] || row.channel })),
    wide ? h("td", { text: row.dealerName }) : null,
    h("td", { class: "records-question", title: row.firstQuestion, text: row.firstQuestion }),
    h("td", { text: String(row.messages) }),
    h("td", { text: String(row.followUps ?? 0) }),
    h("td", { text: duration(row.sessionSeconds) }),
    h("td", { class: "muted", text: clickSummary(row.clicks) || "—" }),
    h("td", {}, row.booked ? h("span", { class: "tag known", text: "Booked" }) : h("span", { class: "muted", text: "—" })),
    actionButtons(
      iconButton("View conversation", EYE, () => viewTranscript(row.phone)),
      iconButton("Open in inbox", CHAT, () => openChat(row.phone)),
    ),
  )) : [emptyRow(columns.length, "No conversations match these filters.")]));
  $("convs-count").textContent = countText(t, data.total, data.items.length);
  pager(t, data.total, $("convs-pager"));
  $("convs-csv").href = `/api/conversations/export?${exportQuery(t)}`;
  $("convs-transcripts").href = `/api/conversations/export-transcripts?${exportQuery(t)}`;
}

async function viewTranscript(phone) {
  const { h } = ui;
  try {
    const { chat, messages } = await ui.api(`/api/conversations/${encodeURIComponent(phone)}/transcript`);
    const who = (m) => (m.direction === "in" ? (chat.name || "Customer") : m.sender === "bot" ? "AI" : m.sender === "system" ? "Note" : (m.agentName || "Staff"));
    showRecord(`${chat.name || "Conversation"} · ${CHANNEL_NAMES[chat.channel] || chat.channel}`, [
      detailList([
        ["Dealer", chat.dealerName], ["Started", dateTime(chat.startedAt)], ["Last message", dateTime(chat.lastAt)],
        ["Messages", chat.messages], ["Session time", duration(chat.sessionSeconds)],
        ["Zip", chat.zip], ["Country", chat.country], ["Page", chat.pageUrl],
        ["Car found", chat.channel === "website" ? (chat.carFound ? "Yes" : "No") : ""], ["Clicks", clickSummary(chat.clicks)],
        ["Booked a visit", chat.booked ? "Yes" : "No"], ["Leads", chat.leads || ""],
      ]),
      h("div", { class: "transcript" }, ...messages.map((m) => h("div", { class: `transcript-row ${m.direction === "in" ? "in" : "out"}${m.sender === "system" ? " system" : ""}` },
        h("div", { class: "transcript-meta" }, h("strong", { text: who(m) }), h("span", { class: "muted", text: dateTime(m.createdAt) })),
        h("div", { class: "transcript-body", text: m.type === "text" ? m.body : `[${m.type}] ${m.body || ""}` })))),
    ], { phone });
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

// ---------- vehicles (dealer stock) ----------

const VIN_RX = /^[A-HJ-NPR-Z0-9]{11,17}$/i;
const ACTIVITY_COLUMNS = [["leads", "Leads"], ["shownInChats", "In chats"], ["views", "Page views"], ["calls", "Calls"], ["texts", "Texts"], ["whatsapp", "WhatsApp"]];

async function loadVehicles() {
  const t = tables.veh;
  const seq = ++t.loading;
  const { $ } = ui;
  $("veh-count").textContent = "Loading stock…";
  try {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...t.filters, page: t.page, perPage: t.perPage })) if (v !== "" && v != null) params.set(k, v);
    const data = await ui.api(`/api/vehicles?${params}`);
    if (seq !== t.loading) return;
    fillStorePick(data.stores);
    paintVehicles(t, data);
  } catch (error) {
    $("veh-count").textContent = "";
    $("veh-body").replaceChildren(emptyRow(10, error.message));
    $("veh-pager").replaceChildren();
  }
}

function fillFacet(select, options, current, allLabel, label = (v) => v) {
  const { h } = ui;
  select.replaceChildren(h("option", { value: "", text: allLabel }),
    ...options.map((o) => h("option", { value: String(o.value).toLowerCase(), text: `${label(o.value)} (${o.count})` })));
  select.value = current || "";
}

function paintVehicles(t, data) {
  const { h, $ } = ui;
  $("veh-dealer").textContent = data.dealer?.name || data.dealer?.source || "";
  $("veh-stock").textContent = `${data.stockTotal} cars on the lot · updated ${data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`;
  const form = $("veh-filters");
  fillFacet(form.elements.make, data.facets.make, t.filters.make, "All makes");
  fillFacet(form.elements.model, data.facets.model, t.filters.model, "All models");
  form.elements.model.disabled = !t.filters.make;
  fillFacet(form.elements.bodyType, data.facets.bodyType, t.filters.bodyType, "All bodies");
  fillFacet(form.elements.condition, data.facets.condition, t.filters.condition, "New & used", (v) => v[0].toUpperCase() + v.slice(1));
  $("veh-head").replaceChildren(...["Car", "VIN", "Price", "Miles", "Days on lot", ...ACTIVITY_COLUMNS.map(([, l]) => l), "Action"]
    .map((label) => h("th", { text: label })));
  $("veh-body").replaceChildren(...(data.items.length ? data.items.map((car) => h("tr", {},
    h("td", {}, h("div", { class: "car-cell" },
      car.image ? h("img", { src: car.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
      h("span", {}, car.title || "—", car.store ? h("small", { class: "muted car-store", text: car.store }) : null))),
    h("td", { class: "mono", text: car.vin }),
    h("td", { text: money(car.price) || "Call" }),
    h("td", { text: miles(car.miles) }),
    h("td", { text: car.daysOnLot ?? "" }),
    ...ACTIVITY_COLUMNS.map(([key]) => {
      const n = car.activity?.[key] || 0;
      return h("td", { class: `activity-cell${n ? "" : " zero"}`, text: String(n) });
    }),
    actionButtons(
      iconButton("View car", CAR, () => openStockCar(car.vin)),
      car.publicUrl ? iconButton("Copy public link", "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1", () => copyLink(car.publicUrl)) : null,
    ),
  )) : [emptyRow(12, "No cars match these filters.")]));
  $("veh-count").textContent = countText(t, data.total, data.items.length).replace("records", "cars");
  pager(t, data.total, $("veh-pager"));
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    ui.toast("Public link copied", "success");
  } catch {
    window.prompt("Copy this link", url);
  }
}

async function openStockCar(vin) {
  const { h } = ui;
  try {
    const store = tables.veh.filters.store;
    const data = await ui.api(`/api/vehicles/${encodeURIComponent(vin)}${store ? `?store=${encodeURIComponent(store)}` : ""}`);
    const a = data.activity || {};
    const extra = [
      h("div", { class: "veh-activity" }, ...ACTIVITY_COLUMNS.map(([key, label]) => h("div", {}, h("span", { text: label }), h("strong", { text: String(a[key] || 0) })))),
      data.leads?.length ? h("div", {}, h("h4", { text: `Leads on this car (${data.leads.length})` }),
        detailList(data.leads.map((l) => [l.name || l.phone || "Customer", day(l.createdAt)]))) : null,
    ];
    const car = data.car || { vin };
    showCar({
      listed: data.listed,
      available: true,
      vehicle: { ...car, inventoryType: car.condition, url: car.url },
      snapshot: { vin },
      dealer: car.dealer || {},
      similar: (data.similar || []).map((c) => ({ ...c, url: c.url || "" })),
    }, {
      extra,
      actions: data.publicUrl ? [
        ui.h("button", { type: "button", class: "btn", onclick: () => copyLink(data.publicUrl) }, "Copy public link"),
        ui.h("a", { class: "btn", href: data.publicUrl, target: "_blank", rel: "noopener" }, "Open public page"),
      ] : [],
    });
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

// ---------- dealer dashboard ----------

let dashStore = "";
// The Dashboard's own Store picker follows "Viewing": switching the viewed store resets it.
document.addEventListener("dealership:switched", () => { dashStore = ""; });

async function loadDashboard() {
  const { h, $ } = ui;
  try {
    const data = await ui.api(`/api/dashboard${dashStore ? `?store=${encodeURIComponent(dashStore)}` : ""}`);
    const t = data.totals || {};
    const select = $("dash-store");
    $("dash-store-wrap").hidden = (data.choices || []).length < 2;
    select.replaceChildren(
      ...(data.choices.length > 1 ? [h("option", { value: "all", text: `All my stores (${data.choices.length})` })] : []),
      ...data.choices.map((c) => h("option", { value: c.id, text: c.name })));
    select.value = data.selected;
    document.dispatchEvent(new CustomEvent("dashboard:loaded", { detail: { selected: data.selected } })); // Trends charts
    const many = data.selected === "all";
    $("dash-note").textContent = many ? "" : (data.stores[0]?.source || "");
    $("d-vehicles").textContent = t.vehicles === null || t.vehicles === undefined ? "—" : t.vehicles.toLocaleString();
    $("d-vehicles-sub").textContent = t.vehicles === null ? "Stock feed not answering" : "on the lot now";
    $("d-views").textContent = (t.views || 0).toLocaleString();
    $("d-views-sub").textContent = `${t.taps || 0} call, text or WhatsApp taps`;
    $("d-leads").textContent = (t.leads || 0).toLocaleString();
    $("d-leads-sub").textContent = `${t.leadsMonth || 0} this month · ${t.leadsUnopened || 0} not opened`;
    $("d-appts").textContent = (t.appointments || 0).toLocaleString();
    $("d-appts-sub").textContent = `${t.upcoming || 0} upcoming`;
    $("d-chats").textContent = (t.chats30 || 0).toLocaleString();
    $("d-chats-sub").textContent = `${t.websiteChats30 || 0} from the website`;
    $("dash-dealer-col").hidden = !many;
    $("dash-leads").replaceChildren(...(data.latestLeads.length ? data.latestLeads.map((l) => h("tr", { class: l.viewed ? "" : "unviewed" },
      h("td", {}, h("div", { class: "car-cell" },
        l.image ? h("img", { src: l.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
        h("span", {}, l.viewed ? null : h("span", { class: "new-dot", title: "Not opened yet" }), l.car || (l.vin ? `VIN ${l.vin}` : "—")))),
      h("td", { text: l.name }),
      h("td", { text: l.phone }),
      many ? h("td", { text: l.dealerName }) : null,
      h("td", { text: day(l.createdAt) }),
      h("td", {}, unlistedBadge(l.vehicleUnlistedAt) || h("span", { class: "muted", text: money(l.price) || "" })),
      actionButtons(
        iconButton("View lead", EYE, () => viewLead(l.id)),
        l.chatKey ? iconButton("Open chat", CHAT, () => openChat(l.chatKey)) : null,
      ),
    )) : [emptyRow(7, "No leads yet.")]));
    const ov = data.overview;
    $("dash-overview").hidden = !ov;
    if (ov) {
      const hours = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.round(sec / 60)}m`);
      const cells = [
        ["Stores", ov.stores], ["Customers", ov.customers, `${ov.activeCustomers30} active in 30 days`], ["Leads", ov.leads], ["Appointments", ov.appointments],
        ["Website chats", ov.websiteChats], ["Session time", hours(ov.sessionSeconds)],
        ["View vehicle", ov.clicks.viewVehicle], ["Visit website", ov.clicks.visitWebsite], ["VIN request", ov.clicks.vinRequest],
        ["Explore more", ov.clicks.exploreMore], ["VIN copied", ov.clicks.vinCopy],
      ];
      $("dash-overview-grid").replaceChildren(...cells.map(([label, value, sub]) => h("div", { class: "overview-cell" },
        h("span", { class: "muted", text: label }), h("strong", { text: typeof value === "number" ? value.toLocaleString() : value }), sub ? h("small", { class: "muted", text: sub }) : null)));
    }
    $("dash-stores-panel").hidden = !many;
    $("dash-stores").replaceChildren(...(many ? data.stores.map((s) => h("tr", {},
      h("td", {}, h("strong", { text: s.name }), h("div", { class: "muted", text: s.source })),
      h("td", { text: s.vehicles === null ? "—" : String(s.vehicles) }),
      h("td", { text: String(s.views) }),
      h("td", { text: String(s.leads) }),
      h("td", { text: String(s.leadsMonth) }),
      h("td", { text: String(s.leadsUnopened) }),
      h("td", { text: String(s.appointments) }),
      h("td", { text: String(s.chats30) }),
    )) : []));
  } catch (error) {
    ui.toast(error.message, "error");
  }
}

export function loadDashboardView() {
  return loadDashboard();
}

export function loadVehiclesView() {
  return loadVehicles();
}

export function loadConversationsView() {
  return loadConversations();
}

// ---------- chat actions ----------

// Save lead / Book visit start from what is known: the CRM, the chat's name, and what a website visitor typed in
// the chat's contact form (name, e-mail, phone).
function contactName(c) {
  return c?.crmIdentity?.customer?.name || c?.crmIdentity?.lead?.name || c?.visitor?.name || c?.name || c?.profileName || "";
}
function contactEmail(c) {
  return c?.crmIdentity?.customer?.email || c?.crmIdentity?.lead?.email || c?.visitor?.email || "";
}
function contactPhone(c) {
  const key = String(c?.phone || "").split("@")[0];
  if (/^(tw|sms):|^\d/.test(key)) return key.replace(/\D/g, "");
  return String(c?.visitor?.phone || c?.crmIdentity?.customer?.phone || "").replace(/\D/g, "");
}

function openForm(dialogId, formId, values) {
  const { $ } = ui;
  const form = $(formId);
  form.reset();
  for (const [k, v] of Object.entries(values)) if (form.elements[k]) form.elements[k].value = v || "";
  $(`${formId}-error`).hidden = true;
  $(dialogId).showModal();
}

function wireForm(dialogId, formId, submit) {
  const { $ } = ui;
  const form = $(formId);
  form.querySelector("[data-close]").addEventListener("click", () => $(dialogId).close());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $(`${formId}-error`);
    err.hidden = true;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await submit(Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()])));
      $(dialogId).close();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}

/** Shows or hides the chat buttons for the open chat (people only, not groups or broadcast lists). */
export function syncChatActions(contact) {
  if (!ui) return;
  const show = Boolean(contact) && !contact.isGroup && !contact.isBroadcast;
  ui.$("save-lead-btn").hidden = !show;
  ui.$("book-visit-btn").hidden = !show;
}

// ---------- ADF setting ----------

async function loadAdf() {
  const { $ } = ui;
  if ($("adf-panel").hidden) return;
  try {
    const { emails, alertEmails, mode } = await ui.api("/api/dealership/adf");
    // Test mode until AutoPulse switches this dealer live (Stores → Store controls → ADF leads live).
    const note = $("adf-mode");
    note.hidden = false;
    note.classList.toggle("warn", mode !== "live");
    note.textContent = mode === "live"
      ? "Live: new leads and appointments are e-mailed to the address below."
      : "Test mode: leads are e-mailed to AutoPulse's test inbox, not to this address yet. AutoPulse switches them live when your CRM is ready.";
    $("adf-form").elements.emails.value = (emails || []).join(", ");
    $("adf-form").elements.alertEmails.value = (alertEmails || []).join(", ");
  } catch {
    // panel stays empty
  }
}

// ---------- entry points ----------

export function loadLeadsView() {
  return loadLeads();
}

export function loadAppointmentsView() {
  return loadAppointments();
}

export function loadAdfSetting() {
  return loadAdf();
}

/** Live updates: refresh the open table when a new record arrives. */
export function onRecordEvent(kind) {
  if (!ui) return;
  if (kind === "lead" && ui.state.view === "leads") loadLeads();
  if (kind === "appointment" && ui.state.view === "appointments") loadAppointments();
  if (kind === "lead" && ui.state.view !== "leads") {
    const badge = ui.$("rail-leads");
    badge.textContent = String((Number(badge.textContent) || 0) + 1);
    badge.hidden = false;
  }
}

export function clearLeadsBadge() {
  if (!ui) return;
  ui.$("rail-leads").hidden = true;
  ui.$("rail-leads").textContent = "0";
}

export function initLeads(helpers) {
  ui = helpers;
  const { $ } = ui;
  wireFilters(tables.leads, "leads-filters", "leads-per-page");
  for (const btn of document.querySelectorAll("[data-leads-mode]")) btn.addEventListener("click", () => setLeadsMode(btn.dataset.leadsMode));
  wireFilters(tables.appts, "appts-filters", "appts-per-page");
  wireFilters(tables.convs, "convs-filters", "convs-per-page");
  wireFilters(tables.veh, "veh-filters", "veh-per-page");
  $("dash-store").addEventListener("change", (e) => { dashStore = e.target.value; loadDashboard(); });
  for (const el of document.querySelectorAll("#view-dashboard [data-go]")) el.addEventListener("click", () => ui.showView(el.dataset.go));
  // A VIN typed in the Vehicles search opens that car straight away (VIN lookup).
  $("veh-filters").addEventListener("submit", (e) => {
    const q = String(e.target.elements.q.value || "").trim();
    if (VIN_RX.test(q)) openStockCar(q.toUpperCase());
  });
  $("veh-filters").elements.make.addEventListener("change", (e) => {
    tables.veh.filters = { ...tables.veh.filters, make: e.target.value, model: "" };
    e.target.form.elements.model.value = "";
  });

  $("save-lead-btn").addEventListener("click", () => {
    const c = ui.state.active;
    if (!c) return;
    openForm("lead-form-dialog", "lead-form", { name: contactName(c), email: contactEmail(c), phone: contactPhone(c) });
  });
  $("book-visit-btn").addEventListener("click", () => {
    const c = ui.state.active;
    if (!c) return;
    const tomorrow = new Date(Date.now() + 86400000);
    const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    openForm("appt-form-dialog", "appt-form", { name: contactName(c), email: contactEmail(c), phone: contactPhone(c), date: iso, time: "10:00" });
  });

  wireForm("lead-form-dialog", "lead-form", async (body) => {
    const c = ui.state.active;
    const { lead, created } = await ui.api(`/api/contacts/${encodeURIComponent(c.phone)}/leads`, { method: "POST", body });
    ui.toast(created ? "Lead saved" : `Already saved today as lead #${lead.id}`, "success");
  });
  wireForm("appt-form-dialog", "appt-form", async (body) => {
    const c = ui.state.active;
    await ui.api(`/api/contacts/${encodeURIComponent(c.phone)}/appointments`, { method: "POST", body });
    ui.toast("Visit booked", "success");
  });

  $("adf-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("adf-error");
    err.hidden = true;
    try {
      const { emails, alertEmails } = await ui.api("/api/dealership/adf", {
        method: "POST",
        body: { emails: e.target.elements.emails.value, alertEmails: e.target.elements.alertEmails.value },
      });
      e.target.elements.emails.value = emails.join(", ");
      e.target.elements.alertEmails.value = alertEmails.join(", ");
      ui.toast("E-mail settings saved", "success");
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });
}
