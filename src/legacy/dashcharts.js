// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/dashcharts.js — edit the port script, not this file.
// Dashboard → Trends: every chart we can draw from the store's own data, for the store (or stores) chosen at the
// top of the dashboard, over 7, 30 or 90 days. AutoPulse admins on "All stores" also get charts per store.
// Data: GET /api/dashboard/charts (app/repo/dashboard-charts.mjs). Drawing: charts.js.
import { barList, heatmap, statTile, timeChart } from "./charts.js";

let ctx = null;
let days = 30;
let store = "";
let seq = 0;

// Fixed colour slot per thing, so a channel or series keeps its colour in every chart.
const CHANNEL_SLOTS = { whatsapp: 1, sms: 2, messenger: 3, instagram: 4, website: 5 };

export function initDashCharts(deps) {
  ctx = deps;
  for (const b of document.querySelectorAll("[data-range]")) {
    b.addEventListener("click", () => {
      days = Number(b.dataset.range);
      for (const x of document.querySelectorAll("[data-range]")) { x.classList.toggle("active", x === b); x.setAttribute("aria-selected", String(x === b)); }
      load();
    });
  }
  // The dashboard tells us which store it shows (and again when the person switches store).
  document.addEventListener("dashboard:loaded", (e) => { store = e.detail?.selected || ""; load(); });
}

const minutes = (s) => (s === null || s === undefined ? "—" : s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

async function load() {
  const { $ } = ctx;
  const grid = $("dash-charts");
  if (!grid) return;
  const mine = ++seq;
  grid.classList.add("loading");
  let d;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    d = await ctx.api(`/api/dashboard/charts?days=${days}&tz=${encodeURIComponent(tz)}${store ? `&store=${encodeURIComponent(store)}` : ""}`);
  } catch (error) {
    if (mine === seq) { grid.classList.remove("loading"); ctx.toast(error.message, "error"); }
    return;
  }
  if (mine !== seq) return;
  grid.classList.remove("loading");
  $("dash-range-note").textContent = `${new Date(`${d.from}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(`${d.to}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  // Charts in groups (Conversations, Leads and bookings, Website and car pages, By store), each a 6-column grid:
  // a trend takes 4 columns with its breakdown (2) beside it, so every row is full.
  const groups = [];
  let current = null;
  const group = (title, note) => {
    current = ctx.h("div", { class: "ch-groupgrid" });
    groups.push(ctx.h("section", { class: "ch-group" }, ctx.h("div", { class: "ch-grouphead" }, ctx.h("h4", { text: title }), note ? ctx.h("span", { class: "muted", text: note }) : null), current));
  };
  const card = (id, span = 6) => {
    const el = ctx.h("section", { class: `panel pad ch-card span-${span}`, id: `ch-${id}` });
    current.append(el);
    return el;
  };

  group("Conversations", "Every channel");
  const used = Object.keys(d.channels).filter((k) => d.chatsByDay.some((x) => x[k]));
  timeChart(card("chats", 6), {
    title: "Conversations per day", note: "People who wrote to the store each day, by channel",
    data: d.chatsByDay, stack: true,
    series: (used.length ? used : ["whatsapp"]).map((k) => ({ key: k, label: d.channels[k], slot: CHANNEL_SLOTS[k] })),
  });
  timeChart(card("messages", 4), {
    title: "Messages per day", note: "From customers, and replies from the AI and your team",
    data: d.messagesByDay,
    series: [{ key: "customer", label: "Customers", slot: 1 }, { key: "ai", label: "AI replies", slot: 2 }, { key: "team", label: "Team replies", slot: 3 }],
  });
  const fr = d.firstReply;
  barList(card("reply", 2), {
    title: "How fast customers get a first reply",
    note: `Middle wait: ${minutes(fr.medianSeconds)}${fr.unanswered ? ` · ${fr.unanswered} not answered yet` : ""}`,
    items: fr.buckets.map((b) => ({ label: b.label, n: b.n })), valueLabel: "Chats", ordinal: true,
  });
  heatmap(card("hours", 4), { title: "When customers write", note: "Customer messages by day of the week and hour (your time)", matrix: d.hours });
  barList(card("departments", 2), { title: "Chats by department", note: "What customers chose when they started", items: d.departments, valueLabel: "Chats", slot: 1 });

  group("Leads and bookings");
  timeChart(card("leads", 4), { title: "Leads per day", data: d.leadsByDay, stack: true, series: [{ key: "leads", label: "Leads", slot: 1 }] });
  barList(card("lead-sources", 2), { title: "Where leads come from", items: d.leadSources.map((s) => ({ label: s.label, n: s.n })), valueLabel: "Leads", slot: 1 });
  timeChart(card("appointments", 4), { title: "Appointments booked per day", data: d.appointmentsByDay, stack: true, series: [{ key: "appointments", label: "Appointments", slot: 1 }] });
  barList(card("appt-sources", 2), { title: "Where bookings come from", items: d.appointmentSources.map((s) => ({ label: s.label, n: s.n })), valueLabel: "Appointments", slot: 1 });

  barList(card("lead-cars", 3), {
    title: "Cars with the most leads", items: d.leadCars.map((c) => ({ label: c.label, n: c.n, sub: `VIN ${c.vin}` })), valueLabel: "Leads", slot: 1,
    onPick: () => ctx.showView("leads"),
  });
  const f = d.funnel;
  barList(card("funnel", 3), {
    title: "From visit to booking", note: f.visitors === null ? "Turn on visitor tracking (Website chat) to count website visitors too" : "In this period",
    items: [...(f.visitors !== null ? [{ label: "Website visitors", n: f.visitors }] : []), { label: "Chatted on the website", n: f.websiteChats }, { label: "Chatted on any channel", n: f.chats }, { label: "Leads", n: f.leads }, { label: "Appointments", n: f.appointments }],
    ordinal: true, valueLabel: "People",
  });

  group("Website and car pages");
  if (d.tracking) {
    timeChart(card("visitors", 4), {
      title: "Website visitors per day", note: "Everyone, and those who told us who they are",
      data: d.visitorsByDay, series: [{ key: "visitors", label: "Visitors", slot: 1 }, { key: "identified", label: "Identified", slot: 2 }],
    });
    barList(card("visitor-pages", 2), { title: "What visitors look at", items: d.visitorPages, valueLabel: "Pages", slot: 1, onPick: () => ctx.showView("visitors") });
  }

  timeChart(card("car-pages", d.tracking ? 6 : 4), {
    title: "Car page views and taps", note: "Our public car pages: views, and call / text / WhatsApp taps",
    data: d.carPagesByDay, series: [{ key: "views", label: "Views", slot: 1 }, { key: "taps", label: "Taps", slot: 2 }],
  });
  if (d.tracking) barList(card("visitor-cars", 3), { title: "Cars visitors look at", items: d.visitorCars.map((c) => ({ label: c.label, n: c.n, sub: `VIN ${c.vin}` })), valueLabel: "Visitors", slot: 1, onPick: () => ctx.showView("visitors") });
  barList(card("car-top", d.tracking ? 3 : 2), { title: "Most viewed car pages", items: d.carPageTop.map((c) => ({ label: `VIN ${c.vin}`, n: c.n })), valueLabel: "Views", slot: 1 });

  // Several stores (AutoPulse admins, agencies): who is busiest.
  if (d.perStore) group("By store", "Busiest stores in this period");
  if (d.perStore?.length) {
    barList(card("store-leads", 3), { title: "Leads by store", items: d.perStore.map((s) => ({ label: s.name, n: s.leads, sub: `${s.appointments} appointments` })), valueLabel: "Leads", slot: 1 });
    barList(card("store-chats", 3), { title: "Conversations by store", items: [...d.perStore].sort((a, b) => b.chats - a.chats).map((s) => ({ label: s.name, n: s.chats })), valueLabel: "Conversations", slot: 1 });
  } else if (d.perStore && !d.perStore.length) {
    statTile(card("store-none", 6), { title: "By store", value: "0", sub: "No store had chats or leads in this period" });
  }
  grid.replaceChildren(...groups);
}
