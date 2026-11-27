// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/app.js — edit the port script, not this file.
import { legacyFetch } from "@/lib/legacyFetch";
import { openLiveEvents } from "@/lib/liveEvents";
import { initFormChecks, markServerField } from "./form-check.js";
// Dates and times in the person's chosen time zone (New York by default). First, before anything formats a date.
import { BROWSER_TIME_ZONE, TIME_ZONE_CHOICES, currentTimeZone, setAppTimeZone } from "./tz.js";
import { EMOJI_CATS, emojiKeywords, searchEmojis } from "./emoji.js";
import { initAccount, loadAccountPanel, loadEnquiries, loadStorePanel, loadWidgetPanel, paintMeAvatar } from "./profile.js";
import { initStores, loadMessaging, loadOutbound, loadSite, loadStores, showImpersonation } from "./stores.js";
import { applyStoreKind, initTeam, loadAiProfile, loadMyPage, loadStorePage, loadStoreSettings, loadTeam } from "./team.js";
import { initStock, loadStockPanel } from "./stock.js";
import { initStart, loadStart } from "./start.js";
import { initPopups, loadPopups } from "./popups.js";
import { initVisitors, loadTrackingPanel, loadVisitorsView } from "./visitors.js";
import { initDashCharts } from "./dashcharts.js";
import { initFacebookPage, loadFacebookPage } from "./fbpage.js";
import { clearLeadsBadge, initLeads, loadAdfSetting, loadAppointmentsView, loadConversationsView, loadDashboardView, loadLeadsView, loadVehiclesView, onRecordEvent, syncChatActions } from "./leads.js";

const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const state = {
  me: null,
  dealership: null,
  dealerships: [],
  crm: false,
  csrf: "",
  sessionToken: "",
  view: "inbox",
  filter: "all",
  channel: "",
  search: "",
  contacts: [],
  active: null,
  messages: [],
  aiInboundEnabled: true,
  aiPlatforms: [],
  aiPhotoUrl: "",
  pendingFile: null,
  pendingVoice: false,
  replyTo: null,
  starredOnly: false,
  threadSearch: "",
  lastTypingAt: 0,
  platforms: {},
  broadcast: false,
  outboundNewChats: false,
  metaGroupsSupported: false,
  roomsSupported: false,
};

const voice = {
  recorder: null,
  chunks: [],
  stream: null,
  noteStartedAt: 0,
  noteTimer: null,
  mime: "",
  device: null,
  call: null,
  callTimer: null,
  callStartedAt: 0,
  muted: false,
  outboundEnabled: false,
  tokenTimer: null,
};

// ---------- API ----------
async function api(path, options = {}) {
  try {
    return await apiOnce(path, options);
  } catch (error) {
    // "Invalid CSRF token": this browser's session changed under this tab (signed in as someone else in another tab,
    // or signed in again). Same person: take the new token and try once more. Someone else: say so and reload.
    if (!error.csrf || options.method === undefined || options.method === "GET") throw error;
    const me = await legacyFetch("/api/me", { credentials: "same-origin", headers: state.sessionToken ? { "X-Session-Token": state.sessionToken } : {} }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!me?.user) { window.location.replace("/login"); throw error; }
    if (state.me && me.user.id !== state.me.id) {
      setTimeout(() => window.location.reload(), 3000);
      throw new Error(`You signed in as ${me.user.displayName || me.user.username} in another tab of this browser, so nothing was changed here. This page now opens as that account.`);
    }
    state.csrf = me.csrfToken;
    return apiOnce(path, options);
  }
}

async function apiOnce(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = state.csrf;
  if (state.sessionToken) headers["X-Session-Token"] = state.sessionToken;
  const res = await legacyFetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    state.sessionToken = "";
    try { sessionStorage.removeItem("autopulse.sessionToken"); } catch {}
    window.location.replace("/login");
    throw new Error("Session expired");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    if (res.status === 400 && data.field) markServerField(data); // mark the wrong field on the form just sent
    if (res.status === 403 && /csrf/i.test(String(data.error || ""))) error.csrf = true;
    // The store was unsubscribed or paused while this page was open: reload to show why (once per page).
    if (res.status === 403 && ["unsubscribed", "store_paused"].includes(data.code) && !state.blockedReload) { state.blockedReload = true; location.reload(); }
    throw error;
  }
  if (Object.prototype.hasOwnProperty.call(data, "sessionToken")) {
    state.sessionToken = data.sessionToken || "";
    try {
      if (state.sessionToken) sessionStorage.setItem("autopulse.sessionToken", state.sessionToken);
      else sessionStorage.removeItem("autopulse.sessionToken");
    } catch {}
  }
  return data;
}

// ---------- formatting ----------
const isMessenger = (key) => String(key || "").startsWith("fb:");
const isTwilio = (key) => /^(tw|tg):/i.test(String(key || ""));
const isSms = (key) => String(key || "").startsWith("sms:");
const isInstagram = (key) => String(key || "").startsWith("ig:");
const isGroup = (key) => /^(wg|tg):/i.test(String(key || ""));
const isTwilioRoom = (contact) => String(contact?.phone || contact || "").startsWith("tg:");
const isMetaGroup = (contact) => String(contact?.phone || contact || "").startsWith("wg:");
const isBroadcast = (key) => /^bc:/i.test(String(key || ""));
const isWeb = (key) => String(key || "").startsWith("web:");
/** Our own website widget's chats (live, staff can reply); other website chats are read-only copies from the chatbot app. */
const isLiveWeb = (key) => String(key || "").startsWith("web:w-");
const CHANNEL_LABEL = { whatsapp: "WhatsApp", messenger: "Messenger", twilio: "WhatsApp", sms: "SMS", instagram: "Instagram", broadcast: "Broadcast", website: "Website" };
const CHANNEL_SHORT = { whatsapp: "WA", messenger: "FB", twilio: "WA", sms: "SMS", instagram: "IG", broadcast: "Broadcast", website: "WEB" };
const FLAG_LABEL = { spam: "Spam", promo: "Promo", ad: "Ad", bot: "Bot" };
const flagLabel = (flag) => FLAG_LABEL[flag] || "Promo";

function phoneDigits(phone) {
  const value = String(phone || "").replace(/@[a-f0-9]{24}$/i, "");
  if (/^(fb|tw|sms|ig):/i.test(value)) return value.slice(value.indexOf(":") + 1);
  return value.replace(/\D/g, "") || value;
}

function formatPhone(phone) {
  if (isBroadcast(phone)) return "Broadcast list";
  if (isGroup(phone) && String(phone).startsWith("wg:")) return "WhatsApp group";
  if (isGroup(phone) && String(phone).startsWith("tg:")) return "WhatsApp room";
  if (isMessenger(phone)) return "Messenger user";
  if (isInstagram(phone)) return "Instagram user";
  const d = phoneDigits(phone);
  if (d.startsWith("92") && d.length === 12) return `+92 ${d.slice(2, 5)} ${d.slice(5)}`;
  if (d.startsWith("1") && d.length === 11) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.startsWith("44") && d.length === 12) return `+44 ${d.slice(2, 6)} ${d.slice(6)}`;
  if (d.startsWith("971") && d.length === 12) return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return d ? `+${d}` : "";
}

function profileName(c) {
  return String(c?.profileName || "").trim();
}

function displayName(c) {
  const label = String(c?.name || "").trim();
  if (!label && isWeb(c?.phone)) return profileName(c) || "Website visitor";
  return label || profileName(c) || formatPhone(c?.phone);
}

const CHANNEL_DP = {
  whatsapp: { bg: "#0d3b2e", shirt: "#1aa37a" },
  messenger: { bg: "#10243b", shirt: "#0080d8" },
  sms: { bg: "#3b2a0d", shirt: "#e0a84a" },
  instagram: { bg: "#2a1030", shirt: "#9b6bff" },
  broadcast: { bg: "#071c1a", shirt: "#14756c" },
};

const DP_VARIANTS = [
  { skin: "#e8b894", extra: '<path d="M20 18c1-8 6-11 12-11s11 3 12 11c-4-3-8-4-12-4s-8 1-12 4z" fill="#2a1a12"/>' },
  { skin: "#c48a62", extra: '<path d="M16 28c2-16 8-20 16-20s14 4 16 20c-2-10-7-14-16-14s-14 4-16 14z" fill="#4a2a14"/>' },
  { skin: "#f0c4a8", extra: '<path d="M24 8c8-2 16 2 16 10 0-6-4-8-8-8s-8 2-8-2z" fill="#1a1a1a"/><circle cx="40" cy="12" r="6" fill="#1a1a1a"/>' },
  { skin: "#8d5524", extra: '<path d="M20 16c2-7 6-9 12-9s10 2 12 9c-4-2-8-3-12-3s-8 1-12 3z" fill="#1c120c"/><path d="M22 34c2 8 6 11 10 11s8-3 10-11c-3 4-7 5-10 5s-7-1-10-5z" fill="#6b3e18"/>' },
  { skin: "#d4a574", extra: '<path d="M14 22c4-14 10-16 18-16s14 2 18 16c-5-8-10-10-18-10s-13 2-18 10z" fill="#3d2314"/>' },
  { skin: "#f5d0b0", extra: '<path d="M20 17c2-8 6-10 12-10s10 2 12 10c-3-2-7-3-12-3s-9 1-12 3z" fill="#6b4423"/><path d="M20 24h8M36 24h8" stroke="#1a1a1a" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="26" r="5" fill="none" stroke="#1a1a1a" stroke-width="2"/><circle cx="40" cy="26" r="5" fill="none" stroke="#1a1a1a" stroke-width="2"/>' },
  { skin: "#b56b45", extra: '<path d="M16 18h32l-3-8H19z" fill="#1a1a1a"/><ellipse cx="32" cy="10" rx="14" ry="6" fill="#111111"/>' },
  { skin: "#e0b090", extra: '<circle cx="18" cy="16" r="7" fill="#c45c26"/><circle cx="32" cy="10" r="8" fill="#c45c26"/><circle cx="46" cy="16" r="7" fill="#c45c26"/><path d="M20 18c2-6 6-8 12-8s10 2 12 8" fill="#c45c26"/>' },
];

function hashKey(value) {
  let n = 0;
  for (const ch of String(value || "")) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n;
}

function staffDpSrc(role) {
  return role === "admin" ? "/assets/dp-admin.svg" : "/assets/dp-agent.svg";
}

function contactDpSrc(contact) {
  const palette = CHANNEL_DP[displayChannel(contact)] || CHANNEL_DP.whatsapp;
  const face = DP_VARIANTS[hashKey(contact?.phone) % DP_VARIANTS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath></defs><g clip-path="url(#c)"><rect width="64" height="64" fill="${palette.bg}"/><circle cx="32" cy="24" r="12" fill="${face.skin}"/><ellipse cx="32" cy="58" rx="22" ry="20" fill="${palette.shirt}"/>${face.extra}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function dpImg(src, extra = "", title = "") {
  return h("img", { class: `dp${extra ? ` ${extra}` : ""}`, src, alt: "", title, draggable: "false" });
}

function ico(name, extra = "") {
  const file = name === "twilio" ? "whatsapp" : name;
  return h("img", { class: `ico${extra ? ` ${extra}` : ""}`, src: `/assets/icon-${file}.svg`, alt: "" });
}

function displayChannel(contact) {
  const channel = channelOf(contact);
  if (channel === "broadcast" || isBroadcast(contact?.phone || contact)) return "broadcast";
  return channel === "twilio" ? "whatsapp" : channel;
}

function channelMark(contact, extra = "") {
  const channel = displayChannel(contact);
  return h("span", { class: `chan-banner ${channel}${extra ? ` ${extra}` : ""}`, title: CHANNEL_LABEL[channel] },
    ico(channel),
    h("span", { text: CHANNEL_SHORT[channel] }));
}

function contactAvatar(contact, extra = "") {
  const channel = displayChannel(contact);
  return h("span", { class: `dp-wrap ${channel}${extra ? ` ${extra}` : ""}`, title: displayName(contact) },
    dpImg(contact?.photoUrl || contactDpSrc(contact)),
    ico(channel, "dp-channel"));
}

function messageAvatar(m) {
  if (m.direction === "in") return contactAvatar(state.active, "sm");
  if (m.sender === "bot") return dpImg(state.aiPhotoUrl || "/assets/dp-ai.svg", "sm", "AI assistant");
  const mine = state.me && m.agentName && m.agentName === state.me.displayName;
  return dpImg(staffDpSrc(mine ? state.me.role : "agent"), "sm", m.agentName || "Agent");
}

const channelOf = (contact) => {
  if (contact && typeof contact === "object" && CHANNEL_LABEL[contact.channel]) return contact.channel;
  const key = typeof contact === "string" ? contact : contact?.phone;
  if (isBroadcast(key)) return "broadcast";
  if (String(key || "").startsWith("web:")) return "website";
  if (isMessenger(key)) return "messenger";
  if (isInstagram(key)) return "instagram";
  if (isTwilio(key)) return "twilio";
  if (isSms(key)) return "sms";
  return "whatsapp";
};
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function shortTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return clock(ts);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

const dateTime = (ts) => (ts ? new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");

// ---------- toasts & dialog ----------
function toast(message, type = "info") {
  const el = h("div", { class: `toast ${type}`, text: message });
  $("toasts").append(el);
  setTimeout(() => el.remove(), type === "error" ? 7000 : 4000);
}

const minutes = (s) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s || 0} s`);

/** Website widget visitor: contact form details, browser details, and the same person elsewhere in the inbox. */
function paintVisitor(visitor) {
  const box = $("lead-dialog-visitor");
  if (!box) return;
  box.hidden = !visitor;
  if (!visitor) return box.replaceChildren();
  const d = visitor.details || {};
  const rows = [
    ["Name", visitor.name], ["E-mail", visitor.email], ["Phone", visitor.phone], ["Area", [d.place, visitor.zip, visitor.country].filter(Boolean).join(" · ")],
    ["Visits", visitor.visits > 1 ? `${visitor.visits} (first ${dateTime(visitor.firstSeenAt)})` : "First visit"],
    ["This chat", `${visitor.messages || 0} messages · ${minutes(visitor.sessionSeconds)} · started ${dateTime(visitor.startedAt)}`],
    ["Page", visitor.pageTitle || visitor.page], ["Came from", d.firstReferrer || visitor.referrer], ["Landing page", d.landing],
    ["Campaign", d.utm ? [d.utm.source, d.utm.medium, d.utm.campaign].filter(Boolean).join(" / ") : ""],
    ["Device", [d.device, d.screen, d.language, d.timezone].filter(Boolean).join(" · ")],
    ["Saved cars", (visitor.favorites || []).join(", ")],
  ].filter(([, v]) => v);
  const related = visitor.related || [];
  box.replaceChildren(
    h("h4", { text: "Website visitor" }),
    h("dl", { class: "kv" }, ...rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: String(v) })])),
    related.length ? h("h4", { text: "Also in the inbox" }) : h("p", { class: "muted", text: "Not found anywhere else in the inbox." }),
    ...related.map((r) => h("div", { class: "lead-other" },
      h("strong", { text: r.kind === "lead" ? `Lead #${r.id}${r.vehicle ? ` · ${r.vehicle}` : ""}` : `${CHANNEL_LABEL[channelOf(r.phone)] || "Chat"} chat` }),
      h("span", { text: r.name || "No name" }),
      h("span", { class: "muted", text: r.kind === "lead" ? `${r.source || "lead"} · ${dateTime(r.createdAt)}` : `Last message ${dateTime(r.lastMessageAt)}` }),
      r.kind === "chat" || r.chatKey ? h("button", { type: "button", class: "btn btn-sm", text: "Open chat", onclick: () => { $("lead-dialog").close(); openContact(r.kind === "chat" ? r.phone : r.chatKey); } }) : null,
    )),
  );
}

function showLeadDialog(contact, elsewhere = [], visitor = null) {
  const identity = contact?.crmIdentity || (visitor ? { status: "new", lead: null, customer: null } : null);
  const dialog = $("lead-dialog");
  if (!dialog || !identity) return;
  paintVisitor(visitor);
  const known = identity.status === "known";
  const lead = identity.lead;
  const customer = identity.customer;
  const store = state.dealership?.dealershipName || "this dealership";
  $("lead-dialog-title").textContent = known ? "Already in the CRM" : "New lead";
  $("lead-dialog-text").textContent = known
    ? `${displayName(contact)} is already a ${lead ? "lead" : "customer"} at ${store}.`
    : `This number is not in ${store} yet.`;
  const rows = [];
  if (lead?.name || customer?.name) rows.push(["Name", lead?.name || customer?.name]);
  if (lead?.phone || customer?.phone) rows.push(["Phone", lead?.phone || customer?.phone]);
  if (lead?.email || customer?.email) rows.push(["Email", lead?.email || customer?.email]);
  if (lead?.status) rows.push(["Status", lead.status]);
  if (lead?.source) rows.push(["Source", lead.source]);
  if (lead?.vehicle) rows.push(["Vehicle", lead.vehicle]);
  if (lead && customer) rows.push(["Customer", customer.name || "Linked customer"]);
  const body = $("lead-dialog-body");
  body.hidden = rows.length === 0;
  body.replaceChildren(...rows.flatMap(([label, value]) => [
    h("dt", { text: label }),
    h("dd", { text: value }),
  ]));
  const others = $("lead-dialog-others");
  if (others) {
    others.hidden = elsewhere.length === 0;
    others.replaceChildren(
      elsewhere.length ? h("h4", { text: "Also at these dealerships" }) : null,
      ...elsewhere.map((row) => h("div", { class: "lead-other" },
        h("strong", { text: row.dealershipName }),
        h("span", { text: row.lead?.name || row.customer?.name || "Saved number" }),
        h("span", { class: "muted", text: [row.lead ? "Lead" : "Customer", row.lead?.phone || row.customer?.phone, row.lead?.status].filter(Boolean).join(" · ") }),
      )),
    );
  }
  if (!dialog.open) dialog.showModal();
}

async function openLead(contact) {
  if (!contact?.phone) return;
  try {
    const data = await api(`/api/contacts/${encodeURIComponent(contact.phone)}/crm`);
    if (data.contact) upsertContact(data.contact);
    showLeadDialog(data.contact || contact, data.elsewhere || [], data.visitor || null);
  } catch (error) {
    toast(error.message, "error");
  }
}

function confirmDialog({ title, text, okLabel = "Confirm", input = false, inputType = "password", placeholder, value = "" }) {
  const dialog = $("dialog");
  $("dialog-title").textContent = title;
  $("dialog-text").textContent = text || "";
  $("dialog-ok").textContent = okLabel;
  const field = $("dialog-input");
  field.hidden = !input;
  field.type = input ? inputType : "password";
  field.autocomplete = inputType === "password" ? "new-password" : "off";
  field.placeholder = placeholder || (input && inputType === "password" ? "New password (min 12 characters)" : "");
  field.value = value;
  dialog.showModal();
  if (input) field.focus();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "ok" ? (input ? field.value : true) : null);
    }, { once: true });
  });
}

// ---------- side menu: collapsed icons or expanded with section names ----------
const RAIL_KEY = "autopulse.rail";

function setupRail() {
  // Each button already has an accessible name; show it as a visible label too.
  for (const btn of document.querySelectorAll(".rail-btn:not(.rail-toggle)")) {
    if (btn.querySelector(".rail-label")) continue;
    const name = btn.getAttribute("aria-label") || btn.title || "";
    btn.append(h("span", { class: "rail-label", text: name.replace(/^Switch theme$/, "Theme") }));
  }
  let open = false;
  // Section names shown by default on wide screens (clearer for new users); the person's own choice is remembered.
  let saved = null;
  try { saved = localStorage.getItem(RAIL_KEY); } catch {}
  open = saved ? saved === "open" : window.innerWidth >= 1280;
  const apply = () => {
    document.querySelector(".app").classList.toggle("rail-open", open);
    const toggle = $("rail-toggle");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = open ? "Collapse menu" : "Expand menu";
    toggle.setAttribute("aria-label", toggle.title);
    $("rail-toggle-label").textContent = toggle.title;
  };
  apply();
  $("rail-toggle").addEventListener("click", () => {
    open = !open;
    try { localStorage.setItem(RAIL_KEY, open ? "open" : "closed"); } catch {}
    apply();
  });
}

// ---------- platform-specific controls ----------
/**
 * What each platform allows from the chat list. Messenger and Instagram cannot start a conversation;
 * SMS has no groups; website chats are read-only. Filters that mean nothing on a platform are hidden.
 */
const CHANNEL_CONTROLS = {
  "": { newChat: true, broadcast: true, room: true, filters: null, search: "Search name or number",
    empty: "New WhatsApp, SMS, Messenger, Instagram, and website messages appear here in real time." },
  whatsapp: { newChat: true, broadcast: true, room: true, filters: null, search: "Search name or number",
    empty: "WhatsApp chats appear here in real time. Start one with New chat." },
  sms: { newChat: true, broadcast: true, room: false, filters: null, search: "Search name or number",
    empty: "SMS chats appear here in real time. Start one with New chat." },
  messenger: { newChat: false, broadcast: false, room: false, filters: null, search: "Search name",
    empty: "Messenger chats start when a customer messages the Facebook Page." },
  instagram: { newChat: false, broadcast: false, room: false, filters: null, search: "Search name",
    empty: "Instagram chats start when a customer messages the Instagram account." },
  website: { newChat: false, broadcast: false, room: false, filters: ["all", "unreplied"], search: "Search website chats",
    empty: "Website chats appear here: live chats from the AutoPulse widget (you can reply), and read-only copies from the old chatbot app." },
};

function syncChannelControls() {
  const c = CHANNEL_CONTROLS[state.channel] || CHANNEL_CONTROLS[""];
  $("new-chat-btn").hidden = !c.newChat || !state.outboundNewChats;
  if ($("broadcast-btn")) $("broadcast-btn").hidden = !(c.broadcast && state.broadcast);
  if ($("room-btn")) $("room-btn").hidden = !(c.room && state.roomsSupported);
  const actions = document.querySelector(".list-head-actions");
  if (actions) actions.hidden = [...actions.children].every((el) => el.hidden);
  for (const tab of document.querySelectorAll(".tab[data-filter]")) {
    tab.hidden = Boolean(c.filters && !c.filters.includes(tab.dataset.filter));
  }
  if (c.filters && !c.filters.includes(state.filter)) {
    state.filter = "all";
    document.querySelectorAll(".tab[data-filter]").forEach((t) => t.classList.toggle("active", t.dataset.filter === "all"));
  }
  $("search").placeholder = c.search;
  if ($("list-empty-hint")) $("list-empty-hint").textContent = c.empty;
}

// ---------- views ----------
const VIEW_META = {
  dashboard: ["Dashboard", "Your stock, leads, appointments and chats at a glance"],
  inbox: ["Inbox", "Live WhatsApp, SMS, Messenger, and Instagram conversations"],
  leads: ["Leads", "Customers interested in a car, from every channel"],
  appointments: ["Appointments", "Showroom visits booked from chats"],
  conversations: ["Conversations", "Every chat on every channel, with counts and session time"],
  visitors: ["Visitors", "Who visits your website: the pages and cars they look at, and who they are when they tell us"],
  vehicles: ["Vehicles", "The dealer's stock, with leads and customer activity per car"],
  team: ["Inbox users", "AutoPulse's own sign-ins: admins, managers and agents of the inbox"],
  chatwidget: ["Website chat", "The chat bubble on your website: look, hours, embed code and test page"],
  store: ["Store", "Store details, contacts, what the AI knows, and your stores"],
  staff: ["Team", "Your people, their departments, how new chats are shared, and who can do what"],
  pages: ["Pages", "Your dealership page and staff pages, with QR codes to share"],
  activity: ["Activity", "Audit trail and system status"],
  settings: ["Settings", "Your account, AI switches, e-mails and alerts"],
  stores: ["Stores", "Every dealership: contacts, subscription, leads, and admin tools"],
};

function showView(view) {
  state.view = view;
  for (const btn of document.querySelectorAll(".rail-btn[data-view]")) {
    btn.classList.toggle("active", btn.dataset.view === view);
  }
  for (const key of Object.keys(VIEW_META)) $(`view-${key}`).hidden = key !== view;
  $("view-title").textContent = VIEW_META[view][0];
  $("view-subtitle").textContent = VIEW_META[view][1];
  if (view === "team") loadUsers();
  if (view === "activity") {
    loadActivity();
    loadEnquiries();
    loadOutbound();
  }
  if (view === "stores") loadStores();
  if (view === "settings") {
    paintSettingsTabs();
    loadAccountPanel().then(() => paintSettingsTabs());
    loadStorePanel();
    loadWidgetPanel();
    loadSite();
    loadMessaging();
    loadSettings();
    loadAdfSetting();
    loadFacebookPage().then(() => paintSettingsTabs());
  }
  if (view === "leads") {
    clearLeadsBadge();
    loadLeadsView();
  }
  if (view === "appointments") loadAppointmentsView();
  if (view === "conversations") loadConversationsView();
  // The Inventory panel asks the server which kind it is for this store (own / feed / CRM dealer: feed + own cars).
  if (view === "vehicles") { loadVehiclesView(); loadStockPanel(); }
  if (view === "chatwidget") { loadWidgetPanel(); loadPopups(); loadTrackingPanel(); }
  if (view === "visitors") loadVisitorsView();
  if (view === "store") { loadStorePanel(); loadAccountPanel(); loadSettings(); if (state.store?.inboxOnly) loadAiProfile(); }
  if (view === "staff" && state.store?.hasTeam) { loadTeam(); loadStoreSettings(); }
  else if (view === "staff" && state.store?.crmTeam) loadTeam();
  if (view === "pages" && state.store?.hasTeam) { loadStorePage(); loadMyPage(); }
  document.body.dataset.view = view;
  if (view === "dashboard") { loadDashboardView(); loadStart(); }
}

// ---------- settings tabs ----------
const SETTINGS_TAB_KEY = "autopulse.settingsTab";
function settingsTabAvailable(tab) {
  return [...document.querySelectorAll(`#settings-grid > [data-stab="${tab}"]`)].some((el) => !el.hidden);
}
function paintSettingsTabs(pick) {
  const grid = $("settings-grid");
  if (!grid) return;
  const buttons = [...document.querySelectorAll("#settings-tabs [data-stab]")];
  for (const btn of buttons) btn.hidden = !settingsTabAvailable(btn.dataset.stab);
  let saved = pick;
  if (!saved) { try { saved = localStorage.getItem(SETTINGS_TAB_KEY); } catch {} }
  const visible = buttons.filter((btn) => !btn.hidden).map((btn) => btn.dataset.stab);
  const active = visible.includes(saved) ? saved : visible[0] || "account";
  grid.dataset.active = active;
  $("settings-tabs").hidden = visible.length < 2;
  for (const btn of buttons) {
    const on = btn.dataset.stab === active;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", String(on));
  }
}
document.getElementById("settings-tabs")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-stab]");
  if (!btn) return;
  try { localStorage.setItem(SETTINGS_TAB_KEY, btn.dataset.stab); } catch {}
  paintSettingsTabs(btn.dataset.stab);
});

// ---------- stats ----------
async function loadStats() {
  try {
    const s = await api("/api/stats");
    $("s-in").textContent = s.inboundToday;
    $("s-out").textContent = s.repliesToday;
    $("s-unread").textContent = s.unread;
    $("s-unreplied").textContent = s.unreplied ?? 0;
    $("s-promo").textContent = s.promo ?? 0;
    $("s-human").textContent = s.humanHandoff;
    if ($("s-queue")) $("s-queue").textContent = s.waiting ?? 0;
    $("s-failed").textContent = s.failed;
    if (s.crm) state.crm = true;
    if (s.aiInboundEnabled !== undefined && !state.dealership?.id) applyAiInbound(s.aiInboundEnabled, s.aiPlatforms, s.aiTakeoverMinutes);
    if (s.dealership && !state.dealership?.id) applyDealership(s.dealership, s.dealerships);
    else if (s.dealerships) fillDealershipSwitch(s.dealerships);
    syncDealershipChrome();
    const badge = $("rail-unread");
    badge.hidden = !s.unread;
    badge.textContent = s.unread > 99 ? "99+" : s.unread;
    document.title = s.unread ? `(${s.unread}) Inbox · AutoPulse` : "Inbox · AutoPulse";
  } catch {}
}

let statsTimer = null;
function refreshStatsSoon() {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(loadStats, 400);
}

const MAX_ATTACH_BYTES = 16 * 1024 * 1024;

function accountKind() {
  return state.me?.crmAccount || (state.me?.role === "admin" ? "superadmin" : "staff");
}

/** AutoPulse super admin: preview what belongs to this customer, ask for DELETE, then delete it all. true if deleted. */
async function eraseCustomerFlow(phone) {
  let preview;
  try {
    preview = await api(`/api/admin/customers/${encodeURIComponent(phone)}/erase`);
  } catch (error) {
    toast(error.message, "error");
    return false;
  }
  const n = preview.counts;
  const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const who = [preview.name, ...preview.emails, ...preview.phones.map((p) => `phone ${p}`)].filter(Boolean).join(", ");
  const typed = await confirmDialog({
    title: "Delete all of this customer's data?",
    text: `${who ? `${who}. ` : ""}This permanently deletes, in this store: ${plural(n.chats, "chat")} with ${plural(n.messages, "message")} and their files, ${plural(n.calls, "call")}, ${plural(n.leads, "lead")}, ${plural(n.appointments, "visit booking")}, ${plural(n.visitorBrowsers, "website visitor record")} with ${plural(n.pageViews, "page view")}, the profile and photo, and the AI's memory of the conversation. It cannot be undone. Records in the AutoPulse CRM are not changed. Type DELETE to confirm.`,
    okLabel: "Delete everything",
    input: true,
    inputType: "text",
    placeholder: "DELETE",
  });
  if (typed === null) return false;
  if (String(typed).trim() !== "DELETE") { toast("Not deleted: type DELETE to confirm.", "info"); return false; }
  try {
    const { erased } = await api(`/api/admin/customers/${encodeURIComponent(phone)}/erase`, { method: "POST", body: { confirm: "DELETE" } });
    if (state.active) {
      state.active = null;
      $("thread").hidden = true;
      $("thread-empty").hidden = false;
      document.querySelector(".inbox")?.classList.remove("has-thread");
    }
    await loadContacts().catch(() => renderContacts());
    toast(`Deleted: ${plural(erased.chats, "chat")}, ${plural(erased.leads, "lead")}, ${plural(erased.appointments, "booking")}`, "success");
    return true;
  } catch (error) {
    toast(error.message, "error");
    return false;
  }
}
const isSuperAdmin = () => accountKind() === "superadmin" && !state.impersonatedBy;

/**
 * Store controls: what AutoPulse switched off for this store, on the Dashboard and the Inbox. The dealer's team
 * learns why something is missing; an AutoPulse admin viewing the store sees it at a glance and where to change it.
 */
function renderRestrictions(items) {
  const admin = Boolean(state.restrictionsAdmin);
  for (const viewId of ["view-dashboard", "view-inbox"]) {
    const view = $(viewId);
    if (!view) continue;
    let bar = view.querySelector(":scope > .restrictions-bar");
    if (!items.length) { if (bar) bar.hidden = true; continue; }
    if (!bar) { bar = h("div", { class: "restrictions-bar", role: "status" }); view.prepend(bar); }
    bar.hidden = false;
    bar.replaceChildren(
      h("span", { class: "restrictions-ic", "aria-hidden": "true", text: "⚠" }),
      h("div", { class: "restrictions-txt" },
        h("strong", { text: admin ? "Switched off for this store by AutoPulse" : "AutoPulse has switched some things off for your dealership" }),
        h("ul", {}, ...items.map((r) => h("li", { text: r.text }))),
        h("small", { text: admin ? "Change it in Stores → Actions → Store controls (or Subscribe)." : "Contact AutoPulse (contact@autopulse.ai) to turn them back on." })));
  }
}

function syncDealershipChrome() {
  const select = $("dealership-switch");
  const viewing = select?.closest(".dealer-switch");
  if (viewing) viewing.hidden = ["owner", "member"].includes(accountKind()) ? (state.dealerships || []).length < 2 : accountKind() !== "superadmin";
  const panel = $("dealership-panel");
  if (panel && state.crm) panel.hidden = true;
  const numberPanel = $("number-binding");
  if (numberPanel) numberPanel.hidden = !(state.crm && accountKind() === "superadmin");
  syncComingSoon();
  if (state.view === "settings") paintSettingsTabs();
}

function showNumberHint() {
  const hint = $("number-dealership-hint");
  const select = $("number-dealership");
  if (!hint || !select) return;
  const dealer = state.dealerships.find((row) => String(row.id) === select.value);
  hint.textContent = dealer?.dealerSource
    ? `Chatbot website: ${dealer.dealerSource}`
    : "This store has no website in the CRM, so the chatbot cannot use it yet.";
}

function fillNumberBinding(dealerships = []) {
  state.dealerships = dealerships;
  const select = $("number-dealership");
  if (!select) return;
  const bound = dealerships.find((dealer) => dealer.isDefault) || state.dealership;
  // CRM dealers and inbox-only dealerships; never a test dealership (real customers' messages).
  select.replaceChildren(...dealerships.filter((dealer) => !dealer.isTest).map((dealer) => h("option", {
    value: String(dealer.id),
    text: dealer.dealershipName,
    selected: bound && String(dealer.id) === String(bound.id),
  })));
  showNumberHint();
}

function applyDealership(dealer = {}, dealerships = null) {
  state.dealership = dealer?.id ? dealer : state.dealership;
  const form = $("dealership-form");
  if (form && dealer) {
    form.dealershipName.value = dealer.dealershipName || "";
    form.chatbotName.value = dealer.chatbotName || "";
    form.dealerSource.value = dealer.dealerSource || "";
    form.userId.value = dealer.userId || "";
  }
  const inbound = $("dealership-default");
  if (inbound && dealer) inbound.checked = Boolean(dealer.isDefault);
  if (dealerships) {
    fillDealershipSwitch(dealerships);
    fillNumberBinding(dealerships);
  }
  const subtitle = $("view-subtitle");
  if (subtitle && state.view === "inbox" && dealer?.dealershipName) {
    subtitle.textContent = dealer.dealershipName;
  }
  syncDealershipChrome();
}

function fillDealershipSwitch(dealerships) {
  const select = $("dealership-switch");
  if (!select) return;
  const current = String(state.dealership?.id || "");
  select.replaceChildren(...dealerships.map((dealer) => h("option", {
    value: String(dealer.id),
    text: dealer.dealershipName,
    selected: String(dealer.id) === current,
  })));
}

function belongsHere(contact) {
  if (!contact) return false;
  // Inbox-only stores: chats carry "own:<store id>"; their owner and team view the store by its plain id.
  const own = /^own:(\d+)$/.exec(String(contact.crmDealerId || ""));
  if (own && !state.crm) return Boolean(state.dealership?.id) && Number(own[1]) === Number(state.dealership.id);
  if (state.crm || contact.crmDealerId) return Boolean(state.dealership?.id) && String(contact.crmDealerId || "") === String(state.dealership.id);
  if (!state.dealership?.id || contact.dealershipId == null) return Boolean(state.contacts.some((row) => row.phone === contact.phone));
  return Number(contact.dealershipId) === Number(state.dealership.id);
}

/** Runs the floor: takes over and transfers any chat (dealer, agency, AutoPulse, inbox-only owner or manager). */
function runsFloor() {
  const account = accountKind();
  return ["superadmin", "dealer", "agency", "owner"].includes(account) || (account === "member" && state.me?.role === "manager");
}

function holdDecision(contact) {
  if (!contact || contact.isGroup || contact.isBroadcast) return "send";
  if (!contact.holderUserId || Number(contact.holderUserId) === Number(state.me?.id)) return "send";
  return runsFloor() ? "takeover" : "request";
}

function mediaFileName(m) {
  const raw = decodeURIComponent(String(m.mediaUrl || m.media || "").split("/").pop() || "");
  return raw.replace(/^[a-f0-9]{24}-/i, "") || "Attachment";
}

function isVoiceNote(m) {
  return m.type === "audio" && (/^\s*\[voice\]\s*$/i.test(m.body || "") || /voice-note/i.test(m.media || m.mediaUrl || ""));
}

function svgIcon(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

const ICON_PLAY = "M8 5.2v13.6L19.2 12z";
const ICON_PAUSE = "M6 5h4v14H6zm8 0h4v14h-4z";

function waveHeights(seed, n = 32) {
  let x = 2166136261;
  for (const ch of String(seed || "")) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: n }, () => {
    x = Math.imul(x ^ (x >>> 13), 16777619);
    return 5 + (x >>> 0) % 20;
  });
}

function audioPlayer(src, { voice = false } = {}) {
  const audio = h("audio", { src, preload: "metadata" });
  const time = h("span", { class: "vn-time", text: "0:00" });
  const play = h("button", { type: "button", class: "vn-play", "aria-label": "Play" }, svgIcon(ICON_PLAY));
  const bars = h("div", { class: "vn-wave", "aria-hidden": "true" },
    ...waveHeights(src).map((height) => {
      const el = h("span");
      el.style.height = `${height}px`;
      return el;
    }));

  function markPlayed() {
    const duration = audio.duration;
    const pct = Number.isFinite(duration) && duration > 0 ? audio.currentTime / duration : 0;
    bars.querySelectorAll("span").forEach((el, i, all) => {
      el.classList.toggle("on", i / all.length <= pct);
    });
  }

  function showTime() {
    const duration = audio.duration;
    const ms = (!audio.paused ? audio.currentTime : (Number.isFinite(duration) ? duration : 0)) * 1000;
    time.textContent = formatVoiceTime(ms);
  }

  play.addEventListener("click", () => {
    document.querySelectorAll(".voice-note audio, .audio-note audio").forEach((el) => {
      if (el !== audio) el.pause();
    });
    if (audio.paused) audio.play().catch(() => toast("Could not play the voice note", "error"));
    else audio.pause();
  });
  bars.addEventListener("click", (e) => {
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const rect = bars.getBoundingClientRect();
    audio.currentTime = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;
  });
  audio.addEventListener("play", () => {
    play.replaceChildren(svgIcon(ICON_PAUSE));
    play.setAttribute("aria-label", "Pause");
    play.classList.add("playing");
  });
  audio.addEventListener("pause", () => {
    play.replaceChildren(svgIcon(ICON_PLAY));
    play.setAttribute("aria-label", "Play");
    play.classList.remove("playing");
    showTime();
    markPlayed();
  });
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    showTime();
    markPlayed();
  });
  audio.addEventListener("timeupdate", () => { showTime(); markPlayed(); });
  audio.addEventListener("loadedmetadata", showTime);

  return h("div", { class: voice ? "voice-note" : "audio-note" }, play, bars, time, audio);
}

function mediaEl(m) {
  if (!m.mediaUrl) return null;
  if (m.type === "image" || m.type === "sticker") return h("img", { class: "bubble-media", src: m.mediaUrl, alt: m.type === "sticker" ? "Sticker" : "" });
  if (m.type === "video") return h("video", { class: "bubble-media", src: m.mediaUrl, controls: true });
  if (m.type === "audio") return audioPlayer(m.mediaUrl, { voice: isVoiceNote(m) });
  return h("a", { class: "bubble-file", href: m.mediaUrl, target: "_blank", rel: "noopener", text: mediaFileName(m) });
}

function insertComposer(text, { newline = false } = {}) {
  const input = $("composer-input");
  if (input.disabled) return;
  const extra = newline && input.value && !input.value.endsWith("\n") ? `\n${text}` : text;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${extra}${input.value.slice(end)}`;
  const pos = start + extra.length;
  input.selectionStart = input.selectionEnd = pos;
  input.focus();
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

function applyAiInbound(enabled, platforms, takeover) {
  if (takeover !== undefined && $("ai-takeover")) $("ai-takeover").value = String(takeover);
  state.aiInboundEnabled = Boolean(enabled);
  if (Array.isArray(platforms)) state.aiPlatforms = platforms;
  syncComingSoon();
  const banner = $("ai-global-banner");
  if (banner) banner.hidden = state.aiInboundEnabled;
  const toggle = $("ai-inbound-toggle");
  if (toggle) toggle.checked = state.aiInboundEnabled;
  const label = $("ai-inbound-label");
  if (label) label.textContent = state.aiInboundEnabled ? "AI on for incoming" : "AI off for incoming";
  const hint = $("ai-inbound-hint");
  if (hint) {
    hint.textContent = state.aiInboundEnabled
      ? "New messages get an AI reply on the platforms switched on below."
      : "No inbound message is sent to the chatbot until you turn this back on. You can still reply as a human.";
  }
  renderAiPlatforms();
  if (state.active) renderThreadHeader();
}

/** AI is off for this chat's platform (master switch or the platform's own switch). */
function aiOffForChannel(channel) {
  if (!state.aiInboundEnabled) return true;
  const row = (state.aiPlatforms || []).find((p) => p.id === channel);
  return Boolean(row && !row.aiEnabled);
}

function platformLabel(channel) {
  return (state.aiPlatforms || []).find((p) => p.id === channel)?.label || CHANNEL_LABEL[channel] || channel;
}

/** A messaging channel not set up on this server yet (no keys): its screens say "Coming soon" instead of failing. */
function channelComingSoon(id) {
  const rows = state.aiPlatforms || [];
  const row = rows.find((p) => p.id === id);
  return Boolean(rows.length && row && !row.connected);
}

/** "Coming soon" on the WhatsApp number panel (AutoPulse admins) while WhatsApp/SMS are not set up. */
function syncComingSoon() {
  const panel = $("number-binding");
  if (!panel) return;
  const soon = channelComingSoon("twilio") && channelComingSoon("sms");
  let el = panel.querySelector(".coming-soon");
  if (!el) {
    el = h("p", { class: "callout coming-soon" }, h("b", { text: "Coming soon. " }), "WhatsApp and SMS are not connected on this app yet. The website chat works as usual.");
    panel.querySelector("h3")?.after(el);
  }
  el.hidden = !soon;
  for (const c of panel.querySelectorAll("select, button, input")) c.disabled = soon;
}

function renderAiPlatforms() {
  const box = $("ai-channel-list");
  if (!box) return;
  const master = state.aiInboundEnabled;
  box.replaceChildren(...(state.aiPlatforms || []).map((p) => {
    const input = h("input", { type: "checkbox", "data-platform": p.id });
    // AutoPulse switched the AI off on this channel (Store controls): locked here, the team still replies.
    const locked = (state.aiOff || []).includes(p.id);
    input.checked = p.aiEnabled && !locked;
    input.disabled = locked;
    input.addEventListener("change", () => setAiPlatform(p.id, input.checked, input));
    const status = locked ? "Off by AutoPulse" : !p.connected ? "Not connected" : !master ? "Paused by master switch" : p.aiEnabled ? "AI replying" : "Human only";
    return h("div", { class: `ai-channel-row${p.connected ? "" : " is-off"}${locked ? " ai-locked" : ""}` },
      h("div", { class: "ai-channel-name" },
        h("strong", { text: p.label }),
        h("small", { class: `ai-channel-status${locked ? " locked" : p.aiEnabled && master && p.connected ? " on" : ""}`, text: status }),
      ),
      h("label", { class: "switch", title: locked ? "AutoPulse switched the AI off here. Your team still replies. Contact AutoPulse to turn it back on." : `AI replies on ${p.label}` },
        input,
        h("span", { class: "switch-track" }, h("span", { class: "switch-thumb" })),
      ),
    );
  }));
}

async function setAiPlatform(id, enabled, input) {
  try {
    const next = await api("/api/settings", { method: "POST", body: { aiChannels: { [id]: enabled } } });
    applyAiInbound(next.aiInboundEnabled, next.aiPlatforms, next.aiTakeoverMinutes);
    toast(`${platformLabel(id)}: ${enabled ? "AI will reply to new messages" : "AI off — new messages wait for a human"}`, enabled ? "success" : "warn");
  } catch (error) {
    input.checked = !enabled;
    toast(error.message, "error");
  }
}

async function loadSettings() {
  try {
    const next = await api("/api/settings");
    applyAiInbound(next.aiInboundEnabled, next.aiPlatforms, next.aiTakeoverMinutes);
    applyDealership(next.dealership, next.dealerships);
  } catch (error) {
    toast(error.message, "error");
  }
}

// ---------- contact list ----------
async function loadContacts() {
  const params = new URLSearchParams({ filter: state.filter });
  if (state.channel) params.set("channel", state.channel);
  if (state.search) params.set("q", state.search);
  const { contacts, hasMore } = await api(`/api/contacts?${params}`);
  state.contacts = contacts;
  state.hasMoreContacts = Boolean(hasMore);
  renderContacts();
}

function previewFor(contact) {
  const last = contact.lastMessage;
  if (!last) return { text: "No messages yet", failed: false };
  const prefix = last.direction === "out"
    ? (last.source === "broadcast" ? "Broadcast: " : last.sender === "agent" ? "You: " : last.sender === "system" ? "" : "AI: ")
    : "";
  const body = String(last.body || "").trim();
  const text = last.deleted ? "This message was deleted"
    : last.type === "audio" || /^\[voice\]$/i.test(body) ? "Voice note"
    : last.type === "sticker" || /^\[sticker\]$/i.test(body) ? "Sticker"
    : last.type === "image" || /^\[image\]$/i.test(body) ? "Photo"
    : last.type === "video" || /^\[video\]$/i.test(body) ? "Video"
    : last.type === "location" || /^\[location\]/i.test(body) ? "Location"
    : last.type === "contacts" || /^\[contact/i.test(body) ? "Contact card"
    : last.type === "document" || /^\[document\]$/i.test(body) ? "Document"
    : body.replace(/\s+/g, " ");
  return { text: prefix + text, failed: last.status === "failed", status: last.status, outgoing: last.direction === "out" };
}

// ---------- website visitor presence ----------
const ONLINE_MS = 60_000;
function ago(ts) {
  const sec = (Date.now() - ts) / 1000;
  if (sec < 90) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  return shortTime(ts);
}
/** Online now (the widget checked in within a minute), chat window open, or last seen. Website widget chats only. */
function presenceOf(c) {
  const p = c?.presence;
  if (!p?.lastSeenAt || !isLiveWeb(c.phone)) return null;
  const online = Date.now() - p.lastSeenAt < ONLINE_MS;
  return {
    online, chatOpen: online && p.chatOpen, page: p.page || "",
    text: online ? (p.chatOpen ? "Chat open now" : "On the website now") : `Last seen ${ago(p.lastSeenAt)}`,
  };
}
function presenceEl(c, { long = false } = {}) {
  const p = presenceOf(c);
  if (!p) return null;
  const text = long && p.online && p.page ? `${p.text} · ${p.page}` : p.text;
  return h("span", { class: `presence${p.online ? " on" : ""}${p.chatOpen ? " open" : ""}`, title: p.page ? `Page: ${p.page}` : "" }, h("i", { class: "dot", "aria-hidden": "true" }), text);
}

/** A known visitor is back on the dealer's website: a toast with "Open chat" (and a desktop alert if allowed). */
async function visitorBack(data) {
  let contact = state.contacts.find((c) => c.phone === data.phone);
  if (!contact) {
    try { contact = (await api(`/api/contacts/${encodeURIComponent(data.phone)}`)).contact; } catch { return; } // not this person's store
  }
  if (!contact || !belongsHere(contact)) return;
  const name = displayName(contact) || data.name || "A website visitor";
  const text = `${name} is back on the website${data.page ? ` · ${data.page}` : ""}`;
  const box = h("div", { class: "toast visitor", role: "status" },
    h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "vt", text }),
    h("button", { type: "button", class: "btn btn-sm", text: "Open chat", onclick: () => { box.remove(); openContact(contact.phone); } }),
    "Notification" in window && Notification.permission === "default"
      ? h("button", { type: "button", class: "btn btn-sm ghost", text: "Desktop alerts", onclick: () => Notification.requestPermission() }) : null);
  $("toasts").append(box);
  setTimeout(() => box.remove(), 15000);
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    try {
      const n = new Notification("Visitor back on the website", { body: text, tag: `visitor-${contact.phone}` });
      n.onclick = () => { window.focus(); openContact(contact.phone); n.close(); };
    } catch { /* not supported */ }
  }
}

function renderContacts() {
  const list = $("contact-list");
  list.replaceChildren();
  $("list-empty").hidden = state.contacts.length > 0;
  for (const c of state.contacts) {
    const preview = previewFor(c);
    list.append(h("button", {
      class: `contact${c.phone === state.active?.phone ? " active" : ""}`,
      role: "listitem",
      type: "button",
      onclick: () => openContact(c.phone),
    },
      contactAvatar(c),
      h("span", { class: "contact-body" },
        h("span", { class: "contact-top" },
          h("strong", {
            class: accountKind() === "superadmin" && c.crmIdentity ? "lead-name" : undefined,
            text: displayName(c),
            title: accountKind() === "superadmin" && c.crmIdentity ? "See which dealerships this number is in" : undefined,
            onclick: accountKind() === "superadmin" && c.crmIdentity ? (e) => { e.stopPropagation(); openLead(c); } : undefined,
          }),
          h("time", { text: shortTime(c.lastMessageAt) })),
        h("span", { class: "contact-sub" },
          channelMark(c),
          c.isGroup && !c.isBroadcast ? h("span", { class: "tag", text: String(c.phone).startsWith("tg:") ? "Room" : "Group" }) : null,
          c.isBroadcast || isBroadcast(c.phone) ? null : presenceEl(c) || h("span", {
            class: "contact-phone",
            text: isMessenger(c.phone) ? "Messenger user" : isInstagram(c.phone) ? "Instagram user" : isWeb(c.phone) ? "Website chat" : formatPhone(c.phone),
          }),
          c.name && profileName(c) && c.name !== profileName(c) ? h("span", { class: "contact-profile", text: profileName(c) }) : null),
        h("span", { class: "contact-bottom" },
          h("span", { class: `contact-preview${preview.failed ? " failed" : ""}` },
            preview.outgoing ? ticks(preview.status) : null,
            preview.failed ? `Failed · ${preview.text}` : preview.text,
          ),
          c.unread ? h("span", { class: "badge", text: c.unread }) : null),
        // Tags on their own line (wrapping), so the message preview keeps the full width.
        contactTags(c)),
    ));
  }
  if (state.hasMoreContacts) {
    list.append(h("button", { type: "button", class: "btn list-more", onclick: (e) => loadMoreContacts(e.currentTarget) }, "Load more chats"));
  }
}

const DEPT_LABEL = { sales: "Sales", service: "Service", trade: "Trade-in", finance: "Finance", other: "Other" };

/** Where this customer's lead is: the CRM (found by phone / e-mail), this inbox (saved as a lead here), or both. */
function leadTag(c) {
  if (!c || c.isGroup || c.isBroadcast) return null;
  const known = c.crmIdentity?.status === "known";
  const fresh = c.crmIdentity?.status === "new";
  const inbox = Number(c.inboxLeads || 0) > 0;
  if (!known && !fresh && !inbox) return null;
  return {
    text: known && inbox ? "CRM + Inbox lead" : inbox ? "Inbox lead" : known ? "In CRM" : "New lead",
    cls: known || inbox ? "known" : "new-lead",
    title: known && inbox ? "In the CRM and saved as a lead in this inbox"
      : inbox ? "Saved as a lead in this inbox; not found in the CRM"
      : known ? "Found in the CRM; not saved as a lead in this inbox yet"
      : "Not in the CRM and not saved as a lead yet",
  };
}

function contactTags(c) {
  const open = (e) => { e.stopPropagation(); openLead(c); };
  const tags = [
    c.hasBlocked ? h("span", { class: "tag promo", text: flagLabel(c.flag) }) : null,
    c.department ? h("span", { class: `tag dept dept-${c.department}`, text: DEPT_LABEL[c.department] || c.department }) : null,
    ...(() => { const t = leadTag(c); return t ? [h("span", { class: `tag ${t.cls}`, text: t.text, title: t.title, role: "button", tabindex: "0", onclick: open })] : []; })(),
    c.unreplied && !c.hasBlocked ? h("span", { class: "tag unreplied", text: "Unreplied" }) : null,
    c.botEnabled || (isWeb(c.phone) && !isLiveWeb(c.phone)) ? null : h("span", { class: "tag human", text: "Human" }),
    c.holderName ? h("span", { class: "tag holder", text: c.holderName, title: `${c.holderName} is handling this chat` }) : null,
  ].filter(Boolean);
  return tags.length ? h("span", { class: "contact-tags" }, ...tags) : null;
}

async function loadMoreContacts(button) {
  if (button) { button.disabled = true; button.textContent = "Loading…"; }
  try {
    const params = new URLSearchParams({ filter: state.filter, offset: String(state.contacts.length) });
    if (state.channel) params.set("channel", state.channel);
    if (state.search) params.set("q", state.search);
    const { contacts, hasMore } = await api(`/api/contacts?${params}`);
    const known = new Set(state.contacts.map((c) => c.phone));
    state.contacts.push(...contacts.filter((c) => !known.has(c.phone)));
    state.hasMoreContacts = Boolean(hasMore);
    renderContacts();
  } catch (error) {
    toast(error.message, "error");
    if (button) { button.disabled = false; button.textContent = "Load more chats"; }
  }
}

function upsertContact(contact) {
  if (!contact || !belongsHere(contact)) return;
  const idx = state.contacts.findIndex((c) => c.phone === contact.phone);
  const merged = idx >= 0 ? { ...state.contacts[idx], ...contact } : contact;
  if (idx >= 0) state.contacts.splice(idx, 1);
  const matches =
    (state.filter === "all") ||
    (state.filter === "unread" && merged.unread > 0) ||
    (state.filter === "human" && !merged.botEnabled) ||
    (state.filter === "failed" && merged.lastMessage?.status === "failed") ||
    (state.filter === "promo" && merged.hasBlocked) ||
    (state.filter === "unreplied" && merged.unreplied) ||
    (state.filter === "queue" && !merged.holderUserId && Boolean(merged.queuedAt));
  const channelOk = !state.channel || displayChannel(merged) === state.channel;
  const q = (state.search || "").toLowerCase();
  const digits = q.replace(/\D/g, "");
  const searchOk = !q || merged.phone.includes(state.search) || (merged.name || "").toLowerCase().includes(q) || (merged.profileName || "").toLowerCase().includes(q)
    || [merged.visitor?.name, merged.visitor?.email].some((v) => String(v || "").toLowerCase().includes(q))
    || (digits.length >= 4 && String(merged.visitor?.phone || "").replace(/\D/g, "").includes(digits))
    || idx >= 0; // already in the search results (the server matched it, e.g. on message text): keep it
  if (matches && channelOk && searchOk && !merged.silentVisitor) {
    state.contacts.push(merged);
    state.contacts.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }
  if (state.active?.phone === contact.phone) {
    state.active = { ...state.active, ...contact };
    renderThreadHeader();
  }
  renderContacts();
}

// ---------- thread ----------
async function loadOlderMessages(button) {
  const c = state.active;
  const first = state.messages[0];
  if (!c || !first) return;
  if (button) { button.disabled = true; button.textContent = "Loading…"; }
  const box = $("messages");
  const fromBottom = box.scrollHeight - box.scrollTop;
  try {
    const { messages } = await api(`/api/contacts/${encodeURIComponent(c.phone)}?before=${first.id}`);
    if (state.active?.phone !== c.phone) return;
    const known = new Set(state.messages.map((m) => m.id));
    state.messages = [...messages.filter((m) => !known.has(m.id)), ...state.messages];
    state.olderMessages = messages.length >= 100;
    renderMessages();
    box.scrollTop = box.scrollHeight - fromBottom; // keep the reader's place
  } catch (error) {
    toast(error.message, "error");
    if (button) { button.disabled = false; button.textContent = "Load earlier messages"; }
  }
}

async function openContact(phone) {
  const { contact, messages } = await api(`/api/contacts/${encodeURIComponent(phone)}`);
  state.active = contact;
  // The chat list shows the same tags (lead, department…): refresh this chat's entry too.
  const listed = state.contacts.findIndex((x) => x.phone === contact.phone);
  if (listed >= 0) {
    state.contacts[listed] = { ...state.contacts[listed], ...contact };
    renderContacts();
  }
  state.messages = messages;
  state.olderMessages = messages.length >= 100; // the server sends the latest 100
  state.starredOnly = false;
  state.threadSearch = "";
  clearReplyTo();
  $("starred-filter")?.classList.remove("active");
  if ($("thread-search")) $("thread-search").value = "";
  if ($("thread-search-bar")) $("thread-search-bar").hidden = true;
  $("thread-empty").hidden = true;
  $("thread").hidden = false;
  document.querySelector(".inbox").classList.add("has-thread");
  renderThreadHeader();
  renderMessages(true);
  renderContacts();
  if (contact.unread) {
    api(`/api/contacts/${encodeURIComponent(phone)}/read`, { method: "POST" }).catch(() => {});
  }
  $("composer-input").focus();
}

async function renameActiveContact() {
  const c = state.active;
  if (!c || c.isGroup || c.isBroadcast) return;
  const labeled = Boolean(String(c.name || "").trim());
  const actual = profileName(c);
  const next = await confirmDialog({
    title: labeled ? "Rename this chat" : "Add a name",
    text: actual
      ? `Their ${CHANNEL_LABEL[displayChannel(c)]} name is ${actual}. Your label is only for the inbox.`
      : "This name is only for your inbox. It is not sent to the customer.",
    okLabel: "Save",
    input: true,
    inputType: "text",
    placeholder: "Name for this chat",
    value: c.name || "",
  });
  if (next === null) return;
  try {
    const { contact } = await api(`/api/contacts/${encodeURIComponent(c.phone)}`, { method: "PATCH", body: { name: next } });
    upsertContact(contact);
    toast(String(next).trim() ? "Name saved" : "Name removed", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderThreadHeader() {
  const c = state.active;
  if (!c) return;
  // Inbox-only stores: the customer's page (details, all chats, leads, visits, consent; and their own private link).
  const custBtn = $("customer-page-btn");
  if (custBtn) {
    // Every direct chat has a customer profile (the server checks the person may see it).
    custBtn.hidden = Boolean(c.isGroup || c.isBroadcast);
    custBtn.href = `/customer/${encodeURIComponent(c.phone)}`;
  }
  const channel = channelOf(c);
  const shown = displayChannel(c);
  $("t-avatar").replaceChildren(contactAvatar(c, "lg"));
  $("t-name").textContent = displayName(c);
  const canRename = !c.isGroup && !c.isBroadcast;
  $("t-name").classList.toggle("can-rename", canRename);
  $("t-name").title = canRename ? (c.name ? "Rename this chat" : "Add a name") : "";
  if ($("rename-btn")) {
    $("rename-btn").hidden = !canRename;
    const label = c.name ? "Rename" : "Add name";
    $("rename-btn").title = label;
    $("rename-btn").setAttribute("aria-label", label);
  }
  $("t-channel").replaceChildren(ico(shown), h("span", { text: CHANNEL_LABEL[shown] }));
  $("t-channel").className = `chan-banner ${shown}`;
  $("t-phone").textContent = isMessenger(c.phone) || isInstagram(c.phone) || isWeb(c.phone) || c.isBroadcast ? "" : formatPhone(c.phone);
  $("t-phone").hidden = isMessenger(c.phone) || isInstagram(c.phone) || isWeb(c.phone) || c.isBroadcast;
  const pres = $("t-presence");
  if (pres) {
    const el = presenceEl(c, { long: true });
    pres.hidden = !el;
    pres.replaceChildren(...(el ? [el] : []));
  }
  const profile = $("t-profile");
  const actual = profileName(c);
  if (profile) {
    const showActual = Boolean(actual && c.name && actual !== c.name);
    profile.hidden = !showActual;
    profile.textContent = showActual ? `On ${CHANNEL_LABEL[shown]}: ${actual}` : "";
  }
  const pill = $("t-window");
  if (isLiveWeb(c.phone)) {
    pill.textContent = c.windowOpen ? "Website · live" : "Website · visitor left";
    pill.className = `pill ${c.windowOpen ? "open" : "closed"}`;
  } else if (isWeb(c.phone)) {
    pill.textContent = "Website · read-only";
    pill.className = "pill";
  } else if (c.isBroadcast || isBroadcast(c.phone)) {
    pill.textContent = `${(c.members || []).length} people`;
    pill.className = "pill open";
  } else if (c.isGroup) {
    pill.textContent = c.status === "creating" ? "Creating group" : `${(c.members || []).length} members`;
    pill.className = `pill ${c.status === "active" ? "open" : "closed"}`;
  } else if (channel === "sms") {
    pill.textContent = "SMS · always open";
    pill.className = "pill open";
  } else {
    const w = replyWindow(c);
    pill.textContent = w.label;
    pill.title = w.hint;
    pill.className = `pill ${w.cls}`;
  }
  $("bot-toggle").checked = c.botEnabled;
  $("bot-label").textContent = c.botEnabled ? "AI replying" : "Human handling";
  const leadMark = $("t-lead");
  if (leadMark) {
    const t = leadTag(c);
    leadMark.hidden = !t;
    if (t) {
      leadMark.textContent = t.text;
      leadMark.title = t.title;
      leadMark.className = `tag ${t.cls}`;
    }
  }
  const deptMark = $("t-dept");
  if (deptMark) {
    deptMark.hidden = !c.department;
    deptMark.textContent = c.department ? DEPT_LABEL[c.department] || c.department : "";
    deptMark.className = `tag dept dept-${c.department || ""}`;
  }
  renderConsent(c);
  // Flag as promo/spam: every live chat, including our website widget's chats (read-only chatbot copies excluded).
  const flaggable = !c.isGroup && !c.isBroadcast && (!isWeb(c.phone) || isLiveWeb(c.phone));
  $("flag-btn").hidden = c.hasBlocked || !flaggable;
  $("unflag-btn").hidden = !c.hasBlocked || !flaggable;
  if ($("call-btn")) {
    $("call-btn").hidden = !c.capabilities?.calling;
    $("call-btn").textContent = isTwilio(c.phone) && voice.outboundEnabled ? "Call now" : "Request call";
  }
  syncChatActions(c);
  if ($("invite-btn")) {
    $("invite-btn").hidden = (!c.isGroup && !c.isBroadcast) || c.status !== "active";
    $("invite-btn").textContent = c.isBroadcast || String(c.phone).startsWith("tg:") ? "Add person" : "Invite";
  }
  if ($("delete-list-btn")) $("delete-list-btn").hidden = !c.isBroadcast;
  if ($("erase-customer-btn")) $("erase-customer-btn").hidden = !isSuperAdmin() || c.isGroup || c.isBroadcast;
  if ($("delete-room-btn")) {
    $("delete-room-btn").hidden = !isTwilioRoom(c) && !isMetaGroup(c);
    $("delete-room-btn").textContent = isMetaGroup(c) ? "Delete group" : "Delete room";
  }
  const botSwitch = $("bot-toggle")?.closest(".switch");
  // Our own widget's website chats are live: the AI can be switched on/off. Copies from the old chatbot app are read-only.
  if (botSwitch) botSwitch.hidden = Boolean(c.isBroadcast || isTwilioRoom(c) || (channelOf(c) === "website" && !isLiveWeb(c.phone)));
  // AutoPulse switched the AI off on this chat's channel (Store controls): the switch is locked; the team replies.
  const aiLocked = (state.aiOff || []).includes(channelOf(c));
  if ($("bot-toggle")) {
    $("bot-toggle").disabled = aiLocked;
    if (aiLocked) $("bot-toggle").checked = false;
  }
  if (botSwitch) {
    botSwitch.classList.toggle("is-disabled", aiLocked);
    if (aiLocked) botSwitch.dataset.tip = "AI is switched off on this channel by AutoPulse. You can still reply.";
    else delete botSwitch.dataset.tip;
  }
  renderBroadcastMembers(c);

  const note = $("composer-note");
  const input = $("composer-input");
  const website = channel === "website" && !isLiveWeb(c.phone);
  const optedOut = Boolean(c.messagingOptedOut);
  // Messenger / Instagram after 24 hours: staff (not the AI) may answer for 7 days with Meta's Human Agent tag.
  const humanReply = !c.windowOpen && Boolean(c.humanAgentWindowOpen && state.messaging?.humanAgentReplies)
    && (channel === "messenger" || channel === "instagram");
  const canType = (c.windowOpen || humanReply) && !optedOut;
  if (optedOut) {
    note.hidden = false;
    note.textContent = channel === "sms"
      ? "This customer texted STOP. Nothing can be sent until they text START (Twilio blocks the number until then)."
      : "This customer asked to stop messages. Nothing can be sent until they reply START.";
  } else if (humanReply) {
    note.hidden = false;
    note.textContent = `${platformLabel(channel)}'s 24-hour window is closed. You can still answer as a person for up to 7 days after their last message (Meta's Human Agent rule). The AI can't.`;
  } else if (channel === "website" && isLiveWeb(c.phone)) {
    note.hidden = false;
    const quiet = !c.lastInboundAt || Date.now() - Number(c.lastInboundAt) > 24 * 60 * 60 * 1000;
    note.textContent = quiet
      ? "Live chat from the dealer's website. The visitor has not written in the last 24 hours: your reply is saved and they see it when they come back to the website."
      : "Live chat from the dealer's website. Your reply appears in the visitor's chat window right away.";
  } else if (website) {
    note.hidden = false;
    note.textContent = "Copy of a chat from the old chatbot app. Read-only: the AI answered it on the website.";
  } else if (c.isBroadcast) {
    note.hidden = false;
    note.textContent = "This sends to everyone on the list as a private 1:1. Replies come back in their own chats, with this message already there.";
  } else if (isTwilioRoom(c)) {
    note.hidden = false;
    note.textContent = "This room only sends from the dealership number. Each person gets a private message. Their replies stay in their own chats.";
  } else if (isMetaGroup(c)) {
    note.hidden = false;
    note.textContent = "This Meta WhatsApp group is invite-only. Share the invite link to add people. Replies stay in the group.";
  } else if (c.isGroup && c.status === "creating") {
    note.hidden = false;
    note.textContent = "Meta is still creating this group. Messaging unlocks when the invite link arrives.";
  } else if (!c.windowOpen) {
    note.hidden = false;
    note.textContent = channel === "messenger"
      ? "The 24-hour messaging window is closed. Messenger only allows a reply after the customer messages again."
      : channel === "instagram"
        ? "The 24-hour messaging window is closed. Instagram only allows a reply after the customer messages again."
        : channel === "twilio"
          ? "WhatsApp's 24-hour window is closed. Send an approved template to restart the chat. Free text unlocks when the customer replies."
          : "WhatsApp is locked. This customer must message you first. Free text is only allowed for 24 hours after their last inbound message.";
  } else if (!state.aiInboundEnabled) {
    note.hidden = false;
    note.textContent = "AI is off for all incoming messages. Reply as a human, or turn incoming AI on in Settings.";
  } else if (!c.isGroup && !c.isBroadcast && aiOffForChannel(channel)) {
    note.hidden = false;
    note.textContent = `AI is off for ${platformLabel(channel)}. Reply as a human, or turn it on in Settings → Incoming AI.`;
  } else if (c.hasBlocked) {
    note.hidden = false;
    note.textContent = `Flagged as ${flagLabel(c.flag).toLowerCase()} — AI handed this chat to a human. Reply below, or unflag to let AI resume.`;
  } else if (c.botEnabled) {
    note.hidden = false;
    note.textContent = "AI is replying to this chat. Turn it off to take over, or send a one-off reply below.";
  } else {
    note.hidden = false;
    note.textContent = "You're handling this chat. Turn AI on to let the bot reply.";
  }
  const locked = holdDecision(c) === "request";
  if (locked) {
    note.hidden = false;
    note.textContent = `Only ${c.holderName} can reply while they handle this chat. Ask to take it if you need to reply.`;
  }
  if ($("template-btn")) $("template-btn").hidden = !canSendTemplate(c) || channelOf(c) !== "twilio" || c.windowOpen || locked;
  const templateTool = $("template-tool");
  if (templateTool) {
    templateTool.hidden = !canSendTemplate(c);
    templateTool.disabled = locked || !templatesUsableNow(c);
    templateTool.title = templatesUsableNow(c)
      ? "Send a template"
      : `${CHANNEL_LABEL[channelOf(c)] || "This chat"} only allows replies within 24 hours of the customer's last message`;
  }
  input.disabled = !canType || locked || website;
  $("emoji-btn").disabled = !canType || locked || website;
  $("attach-btn").disabled = !canType || locked || website;
  $("inventory-btn").disabled = !canType || locked || website;
  renderHold(c);
  if (!canType) stopVoice({ discard: true });
  syncComposerSend();
}

// ---------- reply window (WhatsApp, Messenger, Instagram) ----------
const DAY_MS = 24 * 60 * 60 * 1000;
function timeLeft(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)} days`;
}
const at = (ms) => new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** What the team can do now: reply freely (24 h after the customer's last message), staff only (Messenger/Instagram
 *  Human Agent, up to 7 days, when switched on), or nothing until the customer writes again. */
function replyWindow(c) {
  const last = Number(c.lastInboundAt) || 0;
  if (c.windowOpen) {
    const ends = last ? last + DAY_MS : 0;
    return {
      label: ends ? `Can reply · ${timeLeft(ends - Date.now())} left` : "Can reply",
      hint: ends ? `The customer messaged last on ${at(last)}. You and the AI can reply until ${at(ends)}.` : "You and the AI can reply.",
      cls: "open",
    };
  }
  if (c.humanAgentWindowOpen && state.messaging?.humanAgentReplies) {
    const ends = last + 7 * DAY_MS;
    return { label: `Staff reply only · ${timeLeft(ends - Date.now())} left`, hint: `Over 24 hours since their last message: only a team member can reply (Meta's Human Agent rule), until ${at(ends)}. The AI stays quiet.`, cls: "closed" };
  }
  return {
    label: "Reply window closed",
    hint: "Over 24 hours since the customer's last message. You can reply again as soon as they write" + (channelOf(c) === "twilio" ? ", or send an approved template." : "."),
    cls: "closed",
  };
}

// ---------- consent (proof of opt-in, opt-outs) ----------
const CONSENT_CHANNELS = new Set(["whatsapp", "twilio", "sms", "messenger", "instagram"]);
const CONSENT_SOURCE = { staff: "recorded by the team", staff_restore: "restored by an admin", keyword: "they replied START" };

function renderConsent(c) {
  const tag = $("t-consent");
  if (!tag) return;
  const show = CONSENT_CHANNELS.has(channelOf(c)) && !c.isGroup && !c.isBroadcast;
  tag.hidden = !show;
  if (!show) return;
  const consent = c.consent || {};
  if (c.messagingOptedOut) {
    tag.textContent = "Opted out";
    tag.className = "tag consent-out";
    tag.title = consent.optedOutAt ? `Asked to stop on ${new Date(consent.optedOutAt).toLocaleString()}` : "Asked to stop messages";
  } else if (consent.optedIn) {
    tag.textContent = "Opted in ✓";
    tag.className = "tag consent-yes";
    tag.title = `Agreed to get messages from the store on ${new Date(consent.optedInAt).toLocaleString()} (${CONSENT_SOURCE[consent.source] || consent.source}). You may also message them first: follow-ups, templates, broadcasts.`;
  } else {
    tag.textContent = "Replies only";
    tag.className = "tag consent-no";
    tag.title = "Not opted in to messages you start (follow-ups after the reply window, templates, broadcasts, new chats). Replying to their messages is fine. Click to record their agreement if they gave it.";
  }
}

async function consentAction() {
  const c = state.active;
  if (!c) return;
  const sms = channelOf(c) === "sms";
  const admin = state.me?.role === "admin" || accountKind() === "superadmin";
  let body;
  if (c.messagingOptedOut) {
    if (sms || !admin) {
      toast(sms ? "Only the customer can restart SMS, by texting START." : "Only the customer can opt back in (by replying START), or an admin at their request.", "info");
      return;
    }
    const reason = await confirmDialog({
      title: "Restore messaging?",
      text: "Only do this if the customer asked to hear from the store again (for example by phone or in person). It is saved in the audit log.",
      okLabel: "Restore messaging", input: true, inputType: "text", placeholder: "How did the customer ask? (required)",
    });
    if (reason === null) return;
    body = { action: "restore", reason };
  } else {
    const answer = await confirmDialog({
      title: c.consent?.optedIn ? "Consent recorded" : "Record consent",
      text: c.consent?.optedIn
        ? "Type STOP if the customer asked to stop all messages (by phone, e-mail or in person)."
        : "Type YES if the customer agreed to get messages from this store (lead form, phone, in person). Type STOP if they asked to stop all messages.",
      okLabel: "Save", input: true, inputType: "text", placeholder: c.consent?.optedIn ? "STOP" : "YES or STOP",
    });
    if (answer === null) return;
    const word = String(answer).trim().toUpperCase();
    if (word === "YES" && !c.consent?.optedIn) body = { action: "record", confirm: true };
    else if (word === "STOP") body = { action: "optout" };
    else {
      toast("Nothing changed. Type YES or STOP.", "warn");
      return;
    }
  }
  try {
    const { contact } = await api(`/api/contacts/${encodeURIComponent(c.phone)}/consent`, { method: "POST", body });
    upsertContact(contact);
    if (state.active?.phone === contact.phone) {
      state.active = { ...state.active, ...contact };
      renderThreadHeader();
    }
    toast(body.action === "optout" ? "Marked as opted out" : body.action === "restore" ? "Messaging restored" : "Consent recorded", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

const DEPT_NAMES = { sales: "Sales", service: "Service", trade: "Trade-in", finance: "Finance", parts: "Parts", other: "Other" };

/** One chat-control action: POST …/access/<action>, then refresh the chat. */
async function accessAction(action, body = {}, done = "") {
  if (!state.active) return;
  try {
    const { contact } = await api(`/api/contacts/${encodeURIComponent(state.active.phone)}/access/${action}`, { method: "POST", body });
    upsertContact(contact);
    if (done) toast(done, "success");
    loadStats();
  } catch (error) {
    toast(error.message, "error");
    renderHold(state.active);
  }
}

async function askNote(title, text) {
  const note = await confirmDialog({ title, text, okLabel: "Send", input: true, inputType: "text", placeholder: "Note for them (optional)" });
  return note === null ? null : String(note || "").trim();
}

async function loadAssignableStaff() {
  const data = await api("/api/dealership/staff").catch(() => ({ staff: [], departments: [] }));
  state.staff = data.staff || [];
  state.departments = data.departments || [];
  if (state.active) renderHold(state.active);
}

async function requestAccess() {
  await accessAction("request", {}, "Asked to take this chat");
}

function personLabel(p) {
  const depts = (p.departments || []).map((d) => DEPT_NAMES[d] || d).join(", ");
  return `${p.online ? "● " : ""}${p.displayName}${depts ? ` · ${depts}` : ""}`;
}

function renderHold(contact) {
  const bar = $("hold-bar");
  if (!bar) return;
  const direct = contact && !contact.isGroup && !contact.isBroadcast;
  if (!direct) {
    bar.hidden = true;
    bar.replaceChildren();
    return;
  }
  const me = Number(state.me?.id);
  const decision = holdDecision(contact);
  const holding = Number(contact.holderUserId) === me;
  const floor = runsFloor();
  const requestBtn = $("request-access");
  if (requestBtn) {
    requestBtn.hidden = decision !== "request";
    const asked = (contact.requests || []).some((row) => row.kind !== "handoff" && row.requesterId === me);
    requestBtn.textContent = asked ? "Asked ✓" : "Ask to take it";
    requestBtn.disabled = asked;
  }
  const requests = contact.requests || [];
  const access = requests.filter((r) => r.kind !== "handoff");
  const handoffs = requests.filter((r) => r.kind === "handoff");
  const mine = access.some((row) => row.requesterId === me);
  const people = (state.staff || []).filter((p) => Number(p.id) !== Number(contact.holderUserId));
  const bits = [];
  const dept = contact.department ? DEPT_NAMES[contact.department] || contact.department : "";
  // Left: who has the chat, in words, and what that means for you.
  const status = (icon, title, sub, cls = "") => h("div", { class: `hold-status${cls ? ` ${cls}` : ""}` },
    h("span", { class: "hold-ic", "aria-hidden": "true", text: icon }),
    h("div", { class: "hold-txt" }, h("strong", { text: title }), sub ? h("small", { text: sub }) : null));
  if (holding) {
    bits.push(status("✓", "You're handling this chat", "The customer's replies come to you. Hand it off when you're done.", "mine"));
  } else if (contact.holderUserId) {
    const sub = decision === "request"
      ? (mine ? "You asked to take it; you're told when they answer." : "You can read it. Ask to take it if you need to reply.")
      : decision === "takeover" ? "You can take it over (it moves to you)." : "";
    bits.push(status("👤", `Handled by ${contact.holderName}`, sub, "other"));
  } else if (contact.queuedAt) {
    bits.push(status("⏳", `Waiting in the ${dept || "team"} queue`, "Nobody has it yet. Take it to answer the customer.", "queue"));
  }
  // Right: the one next step as a button, then everything else in one "Hand off" menu.
  const actions = [];
  if (!contact.holderUserId && contact.queuedAt) actions.push(h("button", { type: "button", class: "btn btn-sm btn-primary", "data-access": "take-queue", text: "Take this chat" }));
  if (decision === "request") actions.push(h("button", { type: "button", class: `btn btn-sm${mine ? "" : " btn-primary"}`, "data-access": "request", text: mine ? "Asked ✓" : "Ask to take it", title: "The person handling it approves or declines", disabled: mine }));
  if (decision === "takeover") actions.push(h("button", { type: "button", class: "btn btn-sm btn-primary", "data-access": "take", text: "Take over", title: "The chat moves to you now" }));
  const askable = people.filter((p) => Number(p.id) !== me && !handoffs.some((r) => r.targetUserId === p.id));
  const canAsk = askable.length && (holding || !floor);
  const canTransfer = floor && (people.length || state.departments?.length);
  const canRelease = contact.holderUserId && (holding || floor);
  if (canAsk || canTransfer || canRelease) {
    const menu = h("select", { class: "hold-assign hold-menu", "aria-label": "Hand off this chat", title: "Ask a colleague, transfer it, or let it go" },
      h("option", { value: "", text: "Hand off…" }),
      canAsk ? h("optgroup", { label: "Ask a colleague (they accept or decline)" }, ...askable.map((p) => h("option", { value: `ask:${p.id}`, text: personLabel(p) }))) : null,
      canTransfer && people.length ? h("optgroup", { label: "Transfer now to a person" }, ...people.map((p) => h("option", { value: `u:${p.id}`, text: personLabel(p) }))) : null,
      canTransfer && state.departments?.length ? h("optgroup", { label: "Transfer now to a queue" }, ...state.departments.map((d) => h("option", { value: `d:${d.id}`, text: `${d.label} queue` }))) : null,
      canRelease ? h("optgroup", { label: "Let it go" },
        h("option", { value: "rel:queue", text: `Back to the ${dept || "team"} queue` }),
        h("option", { value: "rel:ai", text: "Back to the AI" })) : null);
    menu.addEventListener("change", async () => {
      const value = menu.value;
      menu.value = "";
      if (!value) return;
      const [kind, id] = value.split(":");
      if (kind === "ask") {
        const who = askable.find((p) => String(p.id) === id)?.displayName || "them";
        const note = await askNote(`Ask ${who} to take this chat?`, "They can accept or decline; you're told either way.");
        if (note !== null) accessAction("ask", { userId: Number(id), note }, `Asked ${who}`);
      } else if (kind === "u" || kind === "d") {
        const label = kind === "u" ? people.find((p) => String(p.id) === id)?.displayName : `the ${DEPT_NAMES[id] || id} queue`;
        const note = await askNote(`Transfer to ${label}?`, kind === "u" ? "They get the chat now, with an alert." : "Nobody holds it until someone in that department takes it; they get an alert.");
        if (note === null) return;
        if (kind === "u") accessAction("assign", { userId: Number(id), note }, `Transferred to ${label}`);
        else accessAction("transfer", { department: id, note }, `Sent to ${label}`);
      } else if (kind === "rel") {
        accessAction("release", { to: id }, id === "ai" ? "The AI is answering this chat again" : "Released to the queue");
      }
    });
    actions.push(menu);
  }
  if (actions.length) bits.push(h("div", { class: "hold-actions" }, ...actions));
  const canDecide = holding || floor;
  for (const row of access) {
    if (!canDecide || row.requesterId === me) continue;
    bits.push(h("div", { class: "hold-request" }, h("span", { text: `🙋 ${row.requesterName} asks to take this chat.` }),
      h("button", { type: "button", class: "btn btn-sm btn-primary", "data-access": "grant", "data-requester": String(row.requesterId), text: "Approve" }),
      h("button", { type: "button", class: "btn btn-sm", "data-access": "decline", "data-request": String(row.id), text: "Decline" })));
  }
  for (const row of handoffs) {
    if (row.targetUserId === me) {
      bits.push(h("div", { class: "hold-request ask" }, h("span", { text: `🤝 ${row.requesterName} asks you to take this chat${row.note ? `: “${row.note}”` : "."}` }),
        h("button", { type: "button", class: "btn btn-sm btn-primary", "data-access": "accept", "data-request": String(row.id), text: "Accept" }),
        h("button", { type: "button", class: "btn btn-sm", "data-access": "refuse", "data-request": String(row.id), text: "Decline" })));
    } else if (row.requesterId === me) {
      bits.push(h("div", { class: "hold-request wait" }, h("span", { text: `⏳ You asked ${row.targetName} to take this chat. Waiting for their answer.` })));
    }
  }
  bar.hidden = bits.length === 0;
  bar.replaceChildren(...bits);
}

/** A team alert for me (request, transfer, queue, routed chat…): a toast with Open chat, and a desktop alert if hidden. */
function teamAlert(data) {
  const box = h("div", { class: "toast visitor team", role: "status" },
    h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "vt", text: data.text }),
    h("button", { type: "button", class: "btn btn-sm", text: "Open chat", onclick: () => { box.remove(); openContact(data.phone); } }),
    "Notification" in window && Notification.permission === "default"
      ? h("button", { type: "button", class: "btn btn-sm ghost", text: "Desktop alerts", onclick: () => Notification.requestPermission() }) : null);
  $("toasts").append(box);
  setTimeout(() => box.remove(), 20000);
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    try {
      const n = new Notification("AutoPulse inbox", { body: data.text, tag: `team-${data.phone}-${data.kind}` });
      n.onclick = () => { window.focus(); openContact(data.phone); n.close(); };
    } catch { /* not supported */ }
  }
  loadStats();
  if (state.active?.phone === data.phone) api(`/api/contacts/${encodeURIComponent(data.phone)}`).then((r) => r.contact && upsertContact(r.contact)).catch(() => {});
}

function memberLabel(memberKey) {
  const found = state.contacts.find((c) => c.phone === memberKey);
  return found?.name || formatPhone(memberKey);
}

function renderBroadcastMembers(contact) {
  const box = $("broadcast-members");
  if (!box) return;
  const list = contact?.isBroadcast || isTwilioRoom(contact) || isMetaGroup(contact);
  box.hidden = !list;
  if (!list) {
    box.replaceChildren();
    return;
  }
  const members = contact.members || [];
  if (!members.length) {
    box.replaceChildren(h("span", { class: "muted", text: contact.isBroadcast ? "No one on this list yet. Add a person." : "No one in this room yet. Add a person." }));
    return;
  }
  box.replaceChildren(...members.map((row) => h("span", { class: "broadcast-chip" },
    h("span", { text: memberLabel(row.memberKey) }),
    h("button", {
      type: "button",
      text: "×",
      title: "Remove",
      "aria-label": `Remove ${memberLabel(row.memberKey)}`,
      onclick: () => removeListedMember(row.memberKey),
    }),
  )));
}

async function removeListedMember(memberKey) {
  if (!state.active?.isBroadcast && !isTwilioRoom(state.active) && !isMetaGroup(state.active)) return;
  const room = isTwilioRoom(state.active);
  try {
    const { contact } = await api(room || isMetaGroup(state.active)
      ? `/api/groups/${encodeURIComponent(state.active.phone)}/remove`
      : `/api/broadcast/lists/${encodeURIComponent(state.active.phone)}/remove`, {
      method: "POST",
      body: { phone: memberKey },
    });
    upsertContact(contact);
    state.active = contact;
    renderThreadHeader();
  } catch (error) {
    toast(error.message, "error");
  }
}

function svgPath(viewBox, d, extra = {}) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  for (const [key, value] of Object.entries(extra)) svg.setAttribute(key, value);
  return svg;
}

function clockTick() {
  const svg = svgPath("0 0 16 16", "M8 4.4v4.1l2.6 1.6");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "8");
  circle.setAttribute("r", "6.2");
  svg.prepend(circle);
  return svg;
}

function ticks(status, onInfo) {
  if (status === "failed") return h("span", { class: "wa-ticks failed", title: "Not delivered" }, "!");
  if (!status || status === "queued" || status === "sending") {
    return h("span", { class: "wa-ticks pending", title: "Sending" }, clockTick());
  }
  const title = status === "read" ? "Read" : status === "delivered" ? "Delivered" : "Sent";
  const el = h("span", {
    class: `wa-ticks ${status === "read" ? "read" : status === "delivered" ? "delivered" : "sent"}`,
    title,
    ...(onInfo ? { onclick: (e) => { e.stopPropagation(); onInfo(); } } : {}),
  }, svgPath("0 0 12 11", "M1.2 5.8 4.1 8.8 10.8 1.6"));
  if (status === "delivered" || status === "read") {
    el.append(svgPath("0 0 12 11", "M1.2 5.8 4.1 8.8 10.8 1.6"));
  }
  return el;
}

function formatWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function infoTypeLabel(m) {
  if (m.deleted) return "Deleted message";
  if (isVoiceNote(m)) return "Voice note";
  if (m.type === "image") return "Photo";
  if (m.type === "video") return "Video";
  if (m.type === "sticker") return "Sticker";
  if (m.type === "location") return "Location";
  if (m.type === "contacts") return "Contact card";
  if (m.type === "document") return mediaFileName(m);
  if (m.type === "audio") return "Audio";
  return "Message";
}

function showMessageInfo(m) {
  const previewText = m.deleted ? "This message was deleted" : quotePreview(m);
  const from = m.direction === "in" ? (displayName(state.active) || "Customer") : (senderLabel(m) || "You");
  const body = $("msg-info-body");
  const receipts = m.direction === "out" ? [
    { label: "Read", at: m.readAt, status: "read", empty: "Waiting" },
    { label: "Delivered", at: m.deliveredAt, status: "delivered", empty: "Waiting" },
    { label: "Sent", at: m.sentAt || m.createdAt, status: "sent", empty: "Sending" },
  ] : [
    { label: "Received", at: m.createdAt, status: null, empty: "" },
  ];
  body.replaceChildren(
    h("div", { class: `msg-info-preview ${m.direction}` },
      h("strong", { text: `${infoTypeLabel(m)} · ${from}` }),
      h("span", { text: previewText }),
    ),
    h("div", { class: "msg-info-receipts" },
      ...receipts.map((row) => h("div", { class: `msg-info-row${row.at ? "" : " pending"}` },
        row.status ? ticks(row.at ? row.status : "queued") : h("span", { class: "wa-ticks", text: "↓" }),
        h("div", {},
          h("strong", { text: row.label }),
          h("em", { text: row.at ? formatWhen(row.at) : row.empty }),
        ),
      )),
      m.error ? h("div", { class: "msg-info-row pending" },
        h("span", { class: "wa-ticks failed", text: "!" }),
        h("div", {}, h("strong", { text: "Not delivered" }), h("em", { text: m.error })),
      ) : null,
    ),
  );
  $("msg-info").showModal();
}

function quoteWho(m) {
  if (m.direction === "in") return displayName(state.active) || "Customer";
  return senderLabel(m) || "You";
}

function quotePreview(m) {
  if (m.deleted) return "This message was deleted";
  if (isVoiceNote(m) || m.type === "audio") return "Voice note";
  if (m.type === "sticker") return "Sticker";
  if (m.type === "image") return "Photo";
  if (m.type === "video") return "Video";
  if (m.type === "location") return "Location";
  if (m.type === "contacts") return "Contact card";
  if (m.type === "document") return "Document";
  return String(m.body || "").replace(/\s+/g, " ").slice(0, 120);
}

function setReplyTo(m) {
  state.replyTo = m;
  $("quote-who").textContent = quoteWho(m);
  $("quote-text").textContent = quotePreview(m);
  $("quote-bar").hidden = false;
  $("composer-input").focus();
}

function clearReplyTo() {
  state.replyTo = null;
  $("quote-bar").hidden = true;
}

function formatBubbleText(text) {
  const p = h("p", { class: "bubble-text" });
  const re = /(\[[^\]\n]{1,120}\]\(https?:\/\/[^\s)]+\)|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[\s\S]+?```|`[^`\n]+`|https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
  let last = 0;
  let match;
  const source = String(text || "");
  const appendLink = (raw) => {
    const trimmed = raw.replace(/[),.;!?]+$/g, "");
    const rest = raw.slice(trimmed.length);
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    p.append(h("a", { class: "bubble-link", href, target: "_blank", rel: "noopener noreferrer", text: trimmed }));
    if (rest) p.append(rest);
  };
  while ((match = re.exec(source))) {
    if (match.index > last) p.append(source.slice(last, match.index));
    const token = match[1];
    // Markdown link from the AI: [text](https://…) shows as a link with that text.
    const md = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
    if (md) p.append(h("a", { class: "bubble-link", href: md[2], target: "_blank", rel: "noopener noreferrer", text: md[1] }));
    else if (token.startsWith("```")) p.append(h("code", { class: "wa-pre", text: token.slice(3, -3) }));
    else if (token.startsWith("*")) p.append(h("strong", { text: token.slice(1, -1) }));
    else if (token.startsWith("_")) p.append(h("em", { text: token.slice(1, -1) }));
    else if (token.startsWith("~")) p.append(h("s", { text: token.slice(1, -1) }));
    else if (token.startsWith("`")) p.append(h("code", { text: token.slice(1, -1) }));
    else appendLink(token);
    last = match.index + token.length;
  }
  if (last < source.length) p.append(source.slice(last));
  return p;
}

function locationEl(m) {
  const found = String(m.body || "").match(/\(([-.\d]+),\s*([-.\d]+)\)/);
  if (!found) return formatBubbleText(m.body);
  const url = `https://maps.google.com/?q=${found[1]},${found[2]}`;
  const label = String(m.body).replace(/^\[location\]\s*/i, "").replace(/\([^)]+\)\s*$/, "").trim() || "Location";
  return h("a", { class: "bubble-map", href: url, target: "_blank", rel: "noopener" }, "📍 ", label);
}

function closeMessageMenus() {
  document.querySelectorAll(".msg-menu-list").forEach((el) => { el.hidden = true; });
}

function messageMenu(m) {
  const list = h("div", { class: "msg-menu-list", hidden: true });
  const add = (label, fn) => list.append(h("button", {
    type: "button",
    text: label,
    onclick: (e) => { e.stopPropagation(); list.hidden = true; fn(); },
  }));
  if (!m.deleted) {
    add("Reply", () => setReplyTo(m));
    add(m.starred ? "Unstar" : "Star", () => toggleStar(m));
    add("Copy", () => navigator.clipboard.writeText(m.body || "").then(() => toast("Copied", "success")).catch(() => toast("Could not copy", "error")));
    add("Info", () => showMessageInfo(m));
  }
  add("Delete for me", () => hideMessage(m));
  return h("div", { class: "msg-menu" },
    h("button", {
      type: "button",
      class: "icon-btn",
      title: "Message actions",
      "aria-label": "Message actions",
      onclick: (e) => {
        e.stopPropagation();
        const open = list.hidden;
        closeMessageMenus();
        list.hidden = !open;
      },
    }, svgPath("0 0 24 24", "M12 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z")),
    list,
  );
}

async function toggleStar(m) {
  try {
    const { message } = await api(`/api/messages/${m.id}/star`, { method: "POST", body: { starred: !m.starred } });
    upsertMessage(message);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function hideMessage(m) {
  const ok = await confirmDialog({ title: "Delete message?", text: "This removes it from your inbox only. The customer still has the original.", okLabel: "Delete" });
  if (!ok) return;
  try {
    const { message } = await api(`/api/messages/${m.id}/hide`, { method: "POST", body: {} });
    upsertMessage(message);
  } catch (error) {
    toast(error.message, "error");
  }
}

function pingTyping() {
  if (!state.active?.windowOpen || isSms(state.active.phone) || isGroup(state.active.phone) || isBroadcast(state.active.phone) || Date.now() - state.lastTypingAt < 8000) return;
  state.lastTypingAt = Date.now();
  api(`/api/contacts/${encodeURIComponent(state.active.phone)}/typing`, { method: "POST", body: {} }).catch(() => {});
}

function formatParticipant(value) {
  const raw = String(value || "").replace(/^whatsapp:/i, "").trim();
  const digits = raw.replace(/\D/g, "");
  if (/^\d{6,16}$/.test(digits)) return formatPhone(digits);
  return raw;
}

function senderLabel(m) {
  if (m.direction === "in") return m.participant ? formatParticipant(m.participant) : null;
  if (m.source === "broadcast") return m.agentName ? `Broadcast · ${m.agentName}` : "Broadcast";
  if (m.sender === "agent") return m.templateSid ? `${m.agentName || "Agent"} · Template` : (m.agentName || "Agent");
  if (m.sender === "bot") return "AI assistant";
  return "System";
}

// Website widget activity, logged as lines in the chat and shown as labels in the header.
const EVENT_KINDS = {
  department: { icon: "🏷", label: "Department" },
  human: { icon: "🙋", label: "Asked for a person" },
  match: { icon: "★", label: "Recognised" },
  form: { icon: "✓", label: "Contact form" },
  visit: { icon: "↻", label: "Visit" },
  inquiry: { icon: "🚗", label: "Car inquiry" },
  lead: { icon: "✉", label: "Details request" },
  callback: { icon: "☎", label: "Call back" },
  booking: { icon: "📅", label: "Visit booked" },
  location: { icon: "⌖", label: "Location" },
  saved: { icon: "♥", label: "Saved car" },
  ai: { icon: "⚡", label: "AI took over" },
};

/** Header labels: one per kind of widget activity, with a count; click to jump to the latest one in the chat. */
function paintActivity() {
  const box = $("t-activity");
  if (!box) return;
  const counts = new Map();
  for (const m of state.messages || []) {
    if (m.sender !== "system" || !String(m.type || "").startsWith("event:")) continue;
    const kind = m.type.slice(6);
    const row = counts.get(kind) || { n: 0, last: null };
    row.n += 1;
    row.last = m;
    counts.set(kind, row);
  }
  box.hidden = counts.size === 0;
  box.replaceChildren(...Object.keys(EVENT_KINDS).filter((k) => counts.has(k)).map((kind) => {
    const { n, last } = counts.get(kind);
    const ev = EVENT_KINDS[kind];
    const label = kind === "visit" ? `${n + 1} visits` : n > 1 ? `${ev.label} ×${n}` : ev.label;
    return h("button", { type: "button", class: `act-chip ev-${kind}`, title: last.body, onclick: () => {
      const el = document.getElementById(`msg-${last.id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    } }, h("span", { text: ev.icon, "aria-hidden": "true" }), label);
  }));
}

function renderMessages(scrollToEnd = false) {
  paintActivity();
  const box = $("messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.replaceChildren();
  let lastDay = "";
  const query = state.threadSearch.toLowerCase();
  const messages = state.messages.filter((m) => {
    if (state.starredOnly && !m.starred) return false;
    if (query && !String(m.body || "").toLowerCase().includes(query)) return false;
    return true;
  });
  if (!messages.length) {
    box.append(h("div", { class: "day", text: query || state.starredOnly ? "No matching messages" : "No messages yet" }));
    return;
  }
  if (state.olderMessages && !query && !state.starredOnly) {
    box.append(h("button", { type: "button", class: "btn btn-sm load-older", onclick: (e) => loadOlderMessages(e.currentTarget) }, "Load earlier messages"));
  }
  for (const m of messages) {
    const day = dayLabel(m.createdAt);
    if (day !== lastDay) {
      lastDay = day;
      box.append(h("div", { class: "day", text: day }));
    }
    if (m.sender === "system" && String(m.type || "").startsWith("event:")) {
      const kind = m.type.slice(6);
      const ev = EVENT_KINDS[kind] || { icon: "•", label: "Activity" };
      box.append(h("div", { class: `msg system event ev-${kind}`, id: `msg-${m.id}` },
        h("span", { class: "ev-icon", text: ev.icon, "aria-hidden": "true" }),
        h("p", {}, h("strong", { text: `${ev.label} · ` }), m.body),
        h("time", { text: clock(m.createdAt) })));
      continue;
    }
    if (m.sender === "system") {
      box.append(h("div", { class: `msg system${m.status === "failed" ? " failed" : ""}`, id: `msg-${m.id}` },
        h("p", { text: m.status === "failed" ? (m.error || "Not delivered") : m.body })));
      continue;
    }
    const label = senderLabel(m);
    const avatar = messageAvatar(m);
    const caption = m.mediaUrl && (/^\[[a-z]+\]$/i.test(String(m.body || "").trim()) || isVoiceNote(m)) ? "" : m.body;
    const quote = m.quote ? h("div", {
      class: "bubble-quote",
      onclick: () => document.getElementById(`msg-${m.replyTo}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    },
      h("strong", { text: m.quote.direction === "in" ? (displayName(state.active) || "Customer") : "You" }),
      quotePreview(m.quote),
    ) : null;
    let bodyEl = null;
    if (m.deleted) bodyEl = h("p", { class: "bubble-deleted", text: "This message was deleted" });
    else if (m.type === "location") bodyEl = locationEl(m);
    else if (m.type === "contacts") bodyEl = h("p", { class: "bubble-text", text: "👤 Contact card" });
    else if (m.type === "sticker" && !m.mediaUrl) bodyEl = h("p", { class: "bubble-text", text: "Sticker" });
    else if (caption) bodyEl = formatBubbleText(caption);
    const menu = messageMenu(m);
    const bubble = h("div", { class: "bubble" },
      m.source === "broadcast" ? h("div", { class: "bubble-who", text: label || "Broadcast" }) : (label ? h("div", { class: "bubble-who", text: label }) : null),
      m.status === "blocked" ? h("div", { class: "bubble-who", text: `Flagged as ${flagLabel(m.flag)} — handed to human` }) : null,
      quote,
      m.deleted ? null : mediaEl(m),
      bodyEl,
      h("div", { class: "bubble-meta" },
        m.starred ? h("span", { class: "bubble-star", text: "★" }) : null,
        h("time", { text: clock(m.createdAt) }),
        m.direction === "out" ? ticks(m.status, () => showMessageInfo(m)) : null,
      ),
      !m.deleted && m.status === "failed" ? h("div", { class: "bubble-error" },
        h("span", { text: m.error || "Not delivered" }),
        state.active?.windowOpen || m.templateSid ? h("button", { class: "btn btn-sm", type: "button", text: "Retry", onclick: () => retryMessage(m.id) }) : null) : null);
    box.append(h("div", {
      class: `msg ${m.direction}${m.sender === "agent" ? " agent" : ""}${m.sender === "bot" ? " bot" : ""}${m.status === "failed" ? " failed" : ""}${m.status === "blocked" ? " blocked" : ""}`,
      id: `msg-${m.id}`,
    },
      m.direction === "in" ? avatar : menu,
      bubble,
      m.direction === "out" ? avatar : menu));
  }
  if (scrollToEnd || nearBottom) box.scrollTop = box.scrollHeight;
}

function previewFromMessage(message) {
  return {
    id: message.id,
    body: message.body,
    direction: message.direction,
    sender: message.sender,
    status: message.status,
    type: message.type || "text",
    deleted: Boolean(message.deleted),
    source: message.source === "broadcast" ? "broadcast" : "chat",
  };
}

function applyPreview(message, contact = null) {
  if (!message?.phone) return;
  const existing = state.contacts.find((row) => row.phone === message.phone);
  const base = { ...(existing || {}), ...(contact || {}), phone: message.phone };
  const last = existing?.lastMessage;
  if (contact || !last?.id || last.id === message.id) {
    upsertContact({
      ...base,
      lastMessageAt: Math.max(Number(base.lastMessageAt) || 0, Number(message.createdAt) || 0),
      lastMessage: { ...(last || {}), ...previewFromMessage(message) },
    });
  }
}

function upsertMessage(message) {
  if (!state.active || message.phone !== state.active.phone) return;
  const idx = state.messages.findIndex((m) => m.id === message.id);
  if (idx >= 0) state.messages[idx] = message;
  else state.messages.push(message);
  renderMessages();
}

async function retryMessage(id) {
  try {
    const { message } = await api(`/api/messages/${id}/retry`, { method: "POST" });
    applyPreview(message);
    upsertMessage(message);
    toast("Message queued for retry", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

// ---------- realtime ----------
let source = null;
function connectEvents() {
  source?.close();
  const query = state.sessionToken ? `?sessionToken=${encodeURIComponent(state.sessionToken)}` : "";
  source = openLiveEvents(state.sessionToken);
  const conn = $("conn");
  source.onopen = () => { conn.classList.add("live"); $("conn-label").textContent = "Live"; };
  source.onerror = () => { conn.classList.remove("live"); $("conn-label").textContent = "Reconnecting"; };
  // Disabled, removed, new password or new role: AutoPulse signed this person out. Go to the sign-in page now.
  source.addEventListener("session:ended", () => {
    source.close();
    state.sessionToken = "";
    try { sessionStorage.removeItem("autopulse.sessionToken"); } catch {}
    window.location.replace("/login?ended=1");
  });

  source.addEventListener("message", (ev) => {
    const { message, contact } = JSON.parse(ev.data);
    const viewing = state.active?.phone === message.phone && state.view === "inbox" && !document.hidden;
    if (viewing && message.direction === "in") {
      contact.unread = 0;
      api(`/api/contacts/${encodeURIComponent(message.phone)}/read`, { method: "POST" }).catch(() => {});
    }
    applyPreview(message, contact);
    upsertMessage(message);
    refreshStatsSoon();
  });
  source.addEventListener("status", (ev) => {
    const { message } = JSON.parse(ev.data);
    upsertMessage(message);
    applyPreview(message);
    refreshStatsSoon();
  });
  source.addEventListener("contact", (ev) => {
    upsertContact(JSON.parse(ev.data).contact);
    refreshStatsSoon();
  });
  source.addEventListener("presence", (ev) => {
    const p = JSON.parse(ev.data);
    const c = state.contacts.find((x) => x.phone === p.phone);
    const presence = { lastSeenAt: p.lastSeenAt, chatOpen: p.chatOpen, page: p.page };
    if (c) { c.presence = presence; renderContacts(); }
    if (state.active?.phone === p.phone) { state.active.presence = presence; renderThreadHeader(); }
  });
  source.addEventListener("visitor", (ev) => { visitorBack(JSON.parse(ev.data)); });
  source.addEventListener("team", (ev) => { teamAlert(JSON.parse(ev.data)); });
  source.addEventListener("settings", (ev) => {
    const data = JSON.parse(ev.data);
    if (state.crm && !data.crm) {
      applyAiInbound(data.aiInboundEnabled, data.aiPlatforms, data.aiTakeoverMinutes);
      return;
    }
    if (data.dealership && state.dealership?.id && data.dealership.id !== state.dealership.id) {
      if (data.dealerships) fillDealershipSwitch(data.dealerships);
      return;
    }
    applyAiInbound(data.aiInboundEnabled, data.aiPlatforms, data.aiTakeoverMinutes);
    if (data.dealership) applyDealership(data.dealership, data.dealerships);
  });
  source.addEventListener("lead", () => onRecordEvent("lead"));
  source.addEventListener("appointment", () => onRecordEvent("appointment"));
  source.addEventListener("handoff", (ev) => {
    const { contact, flag } = JSON.parse(ev.data);
    if (contact.hasBlocked || flag) {
      toast(`${displayName(contact)} flagged as ${flagLabel(flag || contact.flag).toLowerCase()}. AI paused — your team can reply.`, "warn");
    } else {
      toast(`${displayName(contact)} asked for a human. AI paused for this chat.`, "warn");
    }
  });
  source.addEventListener("call", (ev) => {
    const { call, contact } = JSON.parse(ev.data);
    if (contact) upsertContact(contact);
    if (call?.direction === "in" && call.status === "ringing") {
      showCallOverlay({
        who: displayName(contact) || formatPhone(call.phone),
        phone: call.phone,
        state: "Incoming WhatsApp call",
        incoming: true,
      });
    }
    if (call && ["completed", "missed", "failed", "canceled"].includes(call.status) && !voice.call) {
      hideCallOverlay();
    }
  });
}

function callParam(call, key) {
  const custom = call?.customParameters;
  if (custom && typeof custom.get === "function") return custom.get(key) || "";
  if (custom && typeof custom === "object") return custom[key] || "";
  return "";
}

function formatCallClock(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function showCallOverlay({ who, phone, state, incoming = false }) {
  const overlay = $("call-overlay");
  if (!overlay) return;
  overlay.hidden = false;
  overlay.dataset.phone = phone || "";
  $("call-who").textContent = who || "WhatsApp customer";
  $("call-state").textContent = state || "Incoming WhatsApp call";
  $("call-timer").hidden = true;
  $("call-answer").hidden = !incoming;
  $("call-decline").hidden = !incoming;
  $("call-mute").hidden = true;
  $("call-hangup").hidden = incoming;
  overlay.classList.remove("live");
}

function showInCallUi() {
  const overlay = $("call-overlay");
  if (!overlay) return;
  overlay.hidden = false;
  overlay.classList.add("live");
  $("call-state").textContent = "On a WhatsApp call";
  $("call-answer").hidden = true;
  $("call-decline").hidden = true;
  $("call-mute").hidden = false;
  $("call-hangup").hidden = false;
  $("call-timer").hidden = false;
  $("call-mute").textContent = voice.muted ? "Unmute" : "Mute";
  voice.callStartedAt = Date.now();
  clearInterval(voice.callTimer);
  voice.callTimer = setInterval(() => {
    $("call-timer").textContent = formatCallClock(Date.now() - voice.callStartedAt);
  }, 250);
}

function hideCallOverlay() {
  clearInterval(voice.callTimer);
  voice.callTimer = null;
  voice.call = null;
  voice.muted = false;
  const overlay = $("call-overlay");
  if (!overlay) return;
  overlay.hidden = true;
  overlay.classList.remove("live");
}

function bindVoiceCall(call) {
  voice.call = call;
  const phone = callParam(call, "contactKey") || String(call.parameters?.From || "").replace(/^whatsapp:/i, "");
  const who = callParam(call, "displayName") || formatPhone(phone);
  showCallOverlay({ who, phone, state: "Incoming WhatsApp call", incoming: true });
  $("call-answer").hidden = false;
  $("call-decline").hidden = false;
  call.on("accept", () => {
    showInCallUi();
    if (phone) openContact(phone).catch(() => {});
  });
  call.on("disconnect", () => {
    hideCallOverlay();
    toast("Call ended", "success");
  });
  call.on("cancel", () => {
    hideCallOverlay();
    toast("Customer ended the call", "warn");
  });
  call.on("reject", () => hideCallOverlay());
  call.on("error", (error) => {
    hideCallOverlay();
    toast(error.message || "Call failed", "error");
  });
}

function bindOutgoingVoiceCall(call, phone) {
  voice.call = call;
  const who = formatPhone(phone);
  showCallOverlay({ who, phone, state: "Calling…" });
  call.on("ringing", () => {
    $("call-state").textContent = "Ringing…";
  });
  call.on("accept", () => showInCallUi());
  call.on("disconnect", () => {
    hideCallOverlay();
    toast("Call ended", "success");
  });
  call.on("cancel", () => {
    hideCallOverlay();
    toast("Call was canceled", "warn");
  });
  call.on("reject", () => {
    hideCallOverlay();
    toast("Call was rejected", "warn");
  });
  call.on("error", (error) => {
    hideCallOverlay();
    toast(error.message || "Call failed", "error");
  });
}

async function refreshVoiceToken() {
  const data = await api("/api/voice/token");
  if (!data.enabled || !data.token) return null;
  return data;
}

async function setupVoice({ userGesture = false } = {}) {
  if (!window.Twilio?.Device) return;
  try {
    const data = await refreshVoiceToken();
    if (!data) {
      voice.outboundEnabled = false;
      $("enable-calls-btn").hidden = true;
      $("call-ready").hidden = true;
      return;
    }
    voice.outboundEnabled = Boolean(data.outboundEnabled);
    if ($("call-btn") && state.active) $("call-btn").textContent = isTwilio(state.active.phone) && voice.outboundEnabled ? "Call now" : "Request call";
    if (!voice.device) {
      voice.device = new window.Twilio.Device(data.token, { logLevel: "error", codecPreferences: ["opus", "pcmu"] });
      voice.device.on("incoming", bindVoiceCall);
      voice.device.on("error", (error) => toast(error.message || "Calling error", "error"));
      voice.device.on("unregistered", () => {
        $("call-ready").hidden = true;
        $("enable-calls-btn").hidden = false;
      });
      voice.device.on("registered", () => {
        $("call-ready").hidden = false;
        $("enable-calls-btn").hidden = true;
      });
    } else {
      voice.device.updateToken(data.token);
    }
    if (voice.device.state !== "registered") await voice.device.register();
    clearTimeout(voice.tokenTimer);
    voice.tokenTimer = setTimeout(() => setupVoice().catch(() => {}), Math.max(30_000, (data.ttlSeconds - 120) * 1000));
  } catch (error) {
    $("call-ready").hidden = true;
    $("enable-calls-btn").hidden = false;
    if (userGesture) toast(error.message || "Could not enable live calls", "error");
  }
}

async function startBrowserVoiceCall() {
  if (!state.active || !isTwilio(state.active.phone) || !voice.outboundEnabled) return false;
  if (!voice.device || voice.device.state !== "registered") {
    await setupVoice({ userGesture: true });
  }
  if (!voice.device || voice.device.state !== "registered") throw new Error("Enable live calls before calling from the browser");
  const digits = phoneDigits(state.active.phone);
  if (!/^\d{6,16}$/.test(digits)) throw new Error("This customer number cannot receive a WhatsApp call");
  const phone = state.active.phone;
  const call = await voice.device.connect({
    params: {
      To: `whatsapp:+${digits}`,
      contactKey: state.active.phone,
      displayName: displayName(state.active),
    },
  });
  bindOutgoingVoiceCall(call, phone);
  return true;
}

// ---------- team ----------
const ROLE_NAMES = { agent: "Agent", manager: "Manager", admin: "Admin" };

async function changeRole(u, role) {
  try {
    await api(`/api/users/${u.id}`, { method: "PATCH", body: { role } });
    toast(`${u.displayName} is now ${ROLE_NAMES[role]}. They sign in again to get it.`, "success");
  } catch (error) {
    toast(error.message, "error");
  }
  loadUsers();
}

async function loadUsers() {
  try {
    const { users } = await api("/api/users");
    const body = $("users-body");
    body.replaceChildren();
    // Self sign-up dealer accounts are managed on the Stores screen, not here.
    for (const u of users.filter((x) => !["owner", "member"].includes(x.crmAccount))) {
      const self = u.id === state.me.id;
      body.append(h("tr", {},
        h("td", {}, h("div", { class: "user-cell" },
          dpImg(staffDpSrc(u.role === "admin" ? "admin" : "agent"), "sm", ROLE_NAMES[u.role] || "Agent"),
          h("div", {}, h("strong", { text: u.displayName }), h("div", { class: "muted", text: `@${u.username}${self ? " (you)" : ""}` })))),
        h("td", {}, self || u.crmUserId
          ? h("span", { text: ROLE_NAMES[u.role] || "Agent" })
          : h("select", { class: "role-pick", "aria-label": `Role for ${u.displayName}`, onchange: (e) => changeRole(u, e.target.value) },
            ...Object.entries(ROLE_NAMES).map(([value, label]) => h("option", { value, text: label, selected: u.role === value })))),
        h("td", { text: dateTime(u.lastLoginAt) }),
        h("td", {}, h("span", { class: `status-dot${u.disabled ? " off" : ""}`, text: u.disabled ? "Disabled" : "Active" })),
        h("td", {}, h("div", { class: "actions" },
          // AutoPulse CRM users sign in with their AutoPulse CRM password: it is changed in AutoPulse CRM, not here.
          u.crmUserId
            ? h("span", { class: "muted small", title: "This person signs in with their AutoPulse CRM password. Change it in AutoPulse CRM.", text: "Password: AutoPulse CRM" })
            : h("button", { class: "btn btn-sm", type: "button", text: "Reset password", onclick: () => resetPassword(u) }),
          self ? null : h("button", { class: "btn btn-sm", type: "button", text: u.disabled ? "Enable" : "Disable", onclick: () => toggleUser(u) }),
          // AutoPulse CRM users are removed in AutoPulse CRM; Disable keeps them out of Connect.
          self || u.crmUserId ? null : h("button", { class: "btn btn-sm btn-danger", type: "button", text: "Delete", onclick: () => deleteUser(u) })))));
    }
  } catch (error) {
    toast(error.message, "error");
  }
}

async function resetPassword(user) {
  const password = await confirmDialog({ title: `Reset password for @${user.username}`, text: "All of their sessions will be signed out.", okLabel: "Reset", input: true });
  if (!password) return;
  try {
    await api(`/api/users/${user.id}/password`, { method: "POST", body: { password } });
    toast("Password reset", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function toggleUser(user) {
  const ok = await confirmDialog({ title: `${user.disabled ? "Enable" : "Disable"} @${user.username}?`, text: user.disabled ? "They will be able to sign in again." : "They will be signed out immediately.", okLabel: user.disabled ? "Enable" : "Disable" });
  if (!ok) return;
  try {
    await api(`/api/users/${user.id}`, { method: "PATCH", body: { disabled: !user.disabled } });
    loadUsers();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function deleteUser(user) {
  const ok = await confirmDialog({ title: `Delete @${user.username}?`, text: "This permanently removes the account. Their past replies stay in conversation history.", okLabel: "Delete" });
  if (!ok) return;
  try {
    await api(`/api/users/${user.id}`, { method: "DELETE" });
    toast("User deleted", "success");
    loadUsers();
  } catch (error) {
    toast(error.message, "error");
  }
}

// ---------- activity ----------
const ACTION_LABELS = {
  "login.success": "Signed in",
  "login.failed": "Failed sign-in",
  "login.locked": "Account locked",
  "login.code.sent": "Sign-in code e-mailed",
  "account.signup": "Dealer signed up",
  "account.profile": "Profile updated",
  "account.photo": "Photo updated",
  "account.store.added": "Store added",
  "password.reset": "Password reset by e-mail",
  logout: "Signed out",
  "bot.enabled": "AI enabled",
  "bot.paused": "AI paused",
  "message.sent": "Sent reply",
  "message.starred": "Starred a message",
  "message.unstarred": "Removed a star",
  "message.hidden": "Deleted a message for me",
  "message.retry": "Retried message",
  "message.unflagged": "Unflagged promo/spam",
  "message.flagged": "Flagged as promo/spam",
  "ai.inbound.enabled": "Turned incoming AI on",
  "ai.inbound.disabled": "Turned incoming AI off",
  "password.changed": "Changed password",
  "user.created": "Created user",
  "user.disabled": "Disabled user",
  "user.enabled": "Enabled user",
  "user.deleted": "Deleted user",
  "user.password_reset": "Reset password",
};

let auditPage = 1;
const AUDIT_PER_PAGE = 50;

function paintAuditPager(total) {
  const pages = Math.max(1, Math.ceil(total / AUDIT_PER_PAGE));
  const go = (p) => { auditPage = p; loadActivity(); };
  const nums = [];
  for (let p = Math.max(1, auditPage - 2); p <= Math.min(pages, auditPage + 2); p += 1) nums.push(p);
  $("audit-pager").replaceChildren(
    h("button", { type: "button", class: "btn btn-sm", disabled: auditPage <= 1, onclick: () => go(auditPage - 1), "aria-label": "Previous page" }, "←"),
    ...nums.map((p) => h("button", { type: "button", class: `btn btn-sm${p === auditPage ? " btn-primary" : ""}`, onclick: () => go(p) }, String(p))),
    h("button", { type: "button", class: "btn btn-sm", disabled: auditPage >= pages, onclick: () => go(auditPage + 1), "aria-label": "Next page" }, "→"),
  );
  const start = total ? (auditPage - 1) * AUDIT_PER_PAGE + 1 : 0;
  $("audit-count").textContent = total ? `Showing ${start} to ${Math.min(total, auditPage * AUDIT_PER_PAGE)} of ${total} entries` : "No entries";
}

async function loadActivity() {
  try {
    const [{ entries, total }, system] = await Promise.all([api(`/api/audit?page=${auditPage}&perPage=${AUDIT_PER_PAGE}`), api("/api/system")]);
    paintAuditPager(total || 0);
    const body = $("audit-body");
    body.replaceChildren();
    for (const e of entries) {
      body.append(h("tr", {},
        h("td", { text: dateTime(e.createdAt) }),
        h("td", { text: e.username ? `@${e.username}` : "—" }),
        h("td", { text: ACTION_LABELS[e.action] || e.action }),
        h("td", { text: e.target && /^\d+$/.test(e.target) ? formatPhone(e.target) : e.target || "—" }),
        h("td", { class: "muted", text: e.ip || "—" })));
    }
    const q = system.queue || {};
    const rows = [
      ["Environment", system.env],
      ["Reply brain", system.chatbotProvider === "flask"
        ? `Flask ${system.chatbotUrl || ""}`.trim()
        : `Interim ${system.chatbotUrl || "not set"}`],
      ["Graph API", system.graphVersion],
      ["WhatsApp number ID", system.phoneNumberId || "Not set"],
      ["Messenger page", system.messengerPageId || "Not connected"],
      ["Instagram account", system.instagramAccountId || "Not connected"],
      ["Twilio WhatsApp", system.twilioWhatsApp ? "Connected" : "Not connected"],
      ["Twilio SMS", system.twilioSms ? "Connected" : "Not connected"],
      ["Data retention", `${system.retentionDays} days`],
      ["Jobs pending", q.pending || 0],
      ["Jobs running", q.running || 0],
      ["Jobs failed", q.failed || 0],
      ["Uptime", `${Math.floor(system.uptimeSeconds / 3600)}h ${Math.floor((system.uptimeSeconds % 3600) / 60)}m`],
    ];
    $("system-info").replaceChildren(...rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: String(v) })]));
  } catch (error) {
    toast(error.message, "error");
  }
}

// ---------- wiring ----------
function wire() {
  for (const btn of document.querySelectorAll(".rail-btn[data-view]")) {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  }

  for (const tab of document.querySelectorAll(".tab[data-filter]")) {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab[data-filter]").forEach((t) => t.classList.toggle("active", t === tab));
      state.filter = tab.dataset.filter;
      loadContacts().catch((e) => toast(e.message, "error"));
    });
  }
  for (const tab of document.querySelectorAll(".tab[data-channel]")) {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab[data-channel]").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      state.channel = tab.dataset.channel;
      syncChannelControls();
      loadContacts().catch((e) => toast(e.message, "error"));
    });
  }

  let searchTimer;
  $("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      loadContacts().catch((err) => toast(err.message, "error"));
    }, 250);
  });

  $("rename-btn")?.addEventListener("click", () => renameActiveContact());
  $("t-name")?.addEventListener("click", () => {
    if (state.active && !state.active.isGroup && !state.active.isBroadcast) renameActiveContact();
  });
  $("back-btn").addEventListener("click", () => {
    document.querySelector(".inbox").classList.remove("has-thread");
    state.active = null;
    state.starredOnly = false;
    clearReplyTo();
    $("starred-filter")?.classList.remove("active");
    $("thread").hidden = true;
    $("thread-empty").hidden = false;
    renderContacts();
  });
  $("quote-clear")?.addEventListener("click", () => clearReplyTo());
  $("starred-filter")?.addEventListener("click", () => {
    state.starredOnly = !state.starredOnly;
    $("starred-filter").classList.toggle("active", state.starredOnly);
    renderMessages(true);
  });
  $("thread-search-btn")?.addEventListener("click", () => {
    const bar = $("thread-search-bar");
    if (!bar) return;
    bar.hidden = !bar.hidden;
    if (!bar.hidden) $("thread-search").focus();
    else {
      state.threadSearch = "";
      $("thread-search").value = "";
      renderMessages();
    }
  });
  $("thread-search")?.addEventListener("input", (e) => {
    state.threadSearch = String(e.target.value || "").trim();
    renderMessages();
  });
  $("msg-info-close")?.addEventListener("click", () => $("msg-info").close());
  document.addEventListener("click", closeMessageMenus);

  $("t-consent")?.addEventListener("click", consentAction);
  $("t-lead")?.addEventListener("click", () => {
    if (state.active) openLead(state.active);
  });

  $("flag-btn").addEventListener("click", async () => {
    if (!state.active) return;
    try {
      const { contact, flag } = await api(`/api/contacts/${encodeURIComponent(state.active.phone)}/flag`, {
        method: "POST",
        body: { reason: "promo" },
      });
      upsertContact(contact);
      await openContact(contact.phone);
      toast(`Flagged as ${flagLabel(flag).toLowerCase()}. AI paused — you can reply as a human.`, "warn");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("unflag-btn").addEventListener("click", async () => {
    if (!state.active) return;
    try {
      const { contact } = await api(`/api/contacts/${encodeURIComponent(state.active.phone)}/unflag`, { method: "POST" });
      upsertContact(contact);
      await openContact(contact.phone);
      toast("Unflagged. AI is back on for new messages.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("ai-takeover")?.addEventListener("change", async (e) => {
    const minutes = Number(e.target.value);
    try {
      const next = await api("/api/settings", { method: "POST", body: { aiTakeoverMinutes: minutes } });
      applyAiInbound(next.aiInboundEnabled, next.aiPlatforms, next.aiTakeoverMinutes);
      toast(minutes ? `If nobody on the team replies within ${minutes} minute${minutes === 1 ? "" : "s"}, the AI takes over.` : "The AI never takes over a chat a person is handling.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("ai-inbound-toggle")?.addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    try {
      const next = await api("/api/settings", { method: "POST", body: { aiInboundEnabled: enabled } });
      applyAiInbound(next.aiInboundEnabled, next.aiPlatforms, next.aiTakeoverMinutes);
      toast(enabled ? "AI will reply to incoming chats on the platforms that are switched on." : "AI paused for all incoming messages.", "warn");
    } catch (error) {
      e.target.checked = !enabled;
      toast(error.message, "error");
    }
  });

  $("bot-toggle").addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    try {
      const { contact } = await api(`/api/contacts/${encodeURIComponent(state.active.phone)}/bot`, { method: "POST", body: { enabled } });
      upsertContact(contact);
      toast(enabled ? "AI replies turned on for this chat" : "You're handling this chat. AI paused.", "success");
    } catch (error) {
      e.target.checked = !enabled;
      toast(error.message, "error");
    }
  });

  const input = $("composer-input");
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    syncComposerSend();
    pingTyping();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("composer").requestSubmit();
    }
  });
  $("composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if ((!body && !state.pendingFile) || !state.active) return;
    $("send-btn").disabled = true;
    try {
      const payload = { body: state.pendingVoice ? (body || "[voice]") : body };
      if (state.replyTo) payload.replyTo = state.replyTo.id;
      if (state.pendingFile) payload.media = await fileToPayload(state.pendingFile);
      const { message } = await api(`/api/contacts/${encodeURIComponent(state.active.phone)}/messages`, { method: "POST", body: payload });
      input.value = "";
      input.style.height = "auto";
      clearAttach();
      clearReplyTo();
      syncComposerSend();
      applyPreview(message);
      upsertMessage(message);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      syncComposerSend();
    }
  });

  const emojiPop = $("emoji-pop");
  const emojiSearch = $("emoji-search");
  const emojiHeading = $("emoji-heading");
  const emojiCatsEl = $("emoji-cats");
  const emojiGrid = $("emoji-grid");
  const emojiEmpty = $("emoji-empty");
  let emojiCat = EMOJI_CATS[0].id;
  function paintEmojiPop() {
    const q = emojiSearch.value.trim();
    const cat = EMOJI_CATS.find((item) => item.id === emojiCat) || EMOJI_CATS[0];
    const items = q ? searchEmojis(q) : cat.items;
    emojiHeading.textContent = q ? (items.length ? `Results for “${q}”` : "No results") : cat.title;
    emojiCatsEl.replaceChildren(...EMOJI_CATS.map((item) => h("button", {
      type: "button",
      class: `emoji-cat${item.id === emojiCat && !q ? " active" : ""}`,
      text: item.label,
      title: item.title,
      onclick: () => {
        emojiCat = item.id;
        emojiSearch.value = "";
        paintEmojiPop();
      },
    })));
    emojiGrid.replaceChildren(...items.map((emoji) => h("button", {
      type: "button",
      text: emoji,
      title: emojiKeywords(emoji).split(" ").slice(0, 6).join(" ") || emoji,
      onclick: () => insertComposer(emoji),
    })));
    emojiEmpty.hidden = items.length > 0;
    emojiEmpty.textContent = q ? `No emoji matching “${q}”` : "No emoji";
  }
  emojiSearch.addEventListener("input", paintEmojiPop);
  emojiSearch.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") e.preventDefault();
  });
  const attachPop = $("attach-pop");
  let attachKind = "media";
  const ATTACH_KINDS = {
    document: {
      accept: ".pdf,.txt,.csv,.rtf,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,text/csv,text/markdown,application/rtf,text/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kinds: ["document"],
      hint: "document (PDF, Word, Excel, PowerPoint, CSV, RTF, or text)",
    },
    media: {
      accept: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/3gpp,.jpg,.jpeg,.png,.webp,.gif,.mp4,.3gp",
      kinds: ["image", "video"],
      hint: "photo or video",
    },
    audio: {
      accept: "audio/mpeg,audio/mp3,audio/x-m4a,audio/aac,audio/amr,audio/ogg,audio/webm,.mp3,.m4a,.aac,.amr,.ogg,.opus,.weba",
      kinds: ["audio"],
      hint: "audio file",
    },
  };
  const ATTACH_EXT = {
    image: new Set(["jpg", "jpeg", "png", "webp", "gif"]),
    video: new Set(["mp4", "3gp", "3gpp"]),
    audio: new Set(["mp3", "m4a", "aac", "amr", "ogg", "opus", "weba"]),
    document: new Set(["pdf", "txt", "csv", "rtf", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]),
  };

  function fileAttachKind(file) {
    const ext = String(file.name || "").split(".").pop().toLowerCase();
    const mime = String(file.type || "").toLowerCase().split(";")[0].trim();
    if (ATTACH_EXT.video.has(ext) || mime.startsWith("video/")) return "video";
    if (ATTACH_EXT.audio.has(ext) || mime.startsWith("audio/")) return "audio";
    if (ATTACH_EXT.image.has(ext) || mime.startsWith("image/")) return "image";
    if (ATTACH_EXT.document.has(ext) || mime.startsWith("text/") || mime.includes("officedocument") || mime.includes("msword") || mime.includes("ms-excel") || mime.includes("ms-powerpoint") || mime === "application/pdf" || mime === "application/rtf") {
      return "document";
    }
    return null;
  }

  function hideComposerPops() {
    emojiPop.hidden = true;
    attachPop.hidden = true;
    $("inventory-pop").hidden = true;
  }

  function onAttachPicked(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACH_BYTES) {
      toast("File is larger than 16 MB", "error");
      e.target.value = "";
      return;
    }
    const spec = ATTACH_KINDS[attachKind];
    const got = fileAttachKind(file);
    if (!spec?.kinds.includes(got)) {
      toast(`Choose a ${spec?.hint || "supported file"}`, "error");
      e.target.value = "";
      return;
    }
    setPendingFile(file, { voice: false });
  }

  function openAttachPicker(kind) {
    const spec = ATTACH_KINDS[kind];
    if (!spec) return;
    attachKind = kind;
    const old = $("attach-input");
    const input = old.cloneNode(true);
    input.id = "attach-input";
    input.accept = spec.accept;
    input.removeAttribute("capture");
    input.value = "";
    old.replaceWith(input);
    input.addEventListener("change", onAttachPicked);
    hideComposerPops();
    input.click();
  }

  paintEmojiPop();
  $("emoji-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = emojiPop.hidden;
    hideComposerPops();
    emojiPop.hidden = !open;
    if (!emojiPop.hidden) emojiSearch.focus();
  });
  $("attach-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = attachPop.hidden;
    hideComposerPops();
    attachPop.hidden = !open;
  });
  document.addEventListener("click", hideComposerPops);
  emojiPop.addEventListener("click", (e) => e.stopPropagation());
  attachPop.addEventListener("click", (e) => e.stopPropagation());
  attachPop.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => openAttachPicker(btn.dataset.kind));
  });
  $("attach-input").addEventListener("change", onAttachPicked);
  $("attach-clear").addEventListener("click", () => clearAttach());
  $("voice-btn").addEventListener("click", () => {
    if (voice.recorder) stopVoice({ discard: true });
    else startVoice().catch((error) => toast(error.message, "error"));
  });
  $("voice-stop").addEventListener("click", () => stopVoice({ discard: false }));
  $("voice-cancel").addEventListener("click", () => stopVoice({ discard: true }));
  $("request-access")?.addEventListener("click", () => requestAccess());
  $("hold-bar")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-access]");
    if (!btn || btn.disabled || !state.active) return;
    try {
      const a = btn.dataset.access;
      const requestId = Number(btn.dataset.request);
      const map = {
        grant: ["grant", { requesterId: Number(btn.dataset.requester) }, "Chat handed over"],
        decline: ["decline", { requestId }, "Request declined"],
        accept: ["handoff", { requestId, accept: true }, "The chat is yours"],
        refuse: ["handoff", { requestId, accept: false }, "Declined"],
        "take-queue": ["take", {}, "The chat is yours"],
      };
      const [action, body, done] = map[a] || [a, {}, ""];
      await accessAction(action, body, done);
      return;
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("number-dealership")?.addEventListener("change", showNumberHint);
  $("number-dealership-save")?.addEventListener("click", async () => {
    const select = $("number-dealership");
    const err = $("number-dealership-error");
    const dealer = state.dealerships.find((row) => String(row.id) === select?.value);
    if (!dealer) return;
    const ok = await confirmDialog({
      title: "Point this number here?",
      text: `New messages, the chatbot, and inventory will use ${dealer.dealershipName}. Chats already in the inbox stay with their dealership.`,
      okLabel: "Use this dealership",
    });
    if (!ok) return;
    err.hidden = true;
    try {
      const next = await api("/api/dealerships/current", { method: "POST", body: { crmId: dealer.id, bind: true } });
      if (next.crm) state.crm = true;
      state.active = null;
      state.messages = [];
      $("messages")?.replaceChildren();
      applyDealership(next.dealership, next.dealerships);
      applyAiInbound(next.aiInboundEnabled, next.aiPlatforms, next.aiTakeoverMinutes);
      // Pages with their own store picker (Dashboard) go back to following the store being viewed.
      document.dispatchEvent(new CustomEvent("dealership:switched", { detail: { id: next.dealership?.id } }));
      await Promise.all([loadContacts(), loadStats(), loadAssignableStaff()]);
      toast(`This number now works for ${next.dealership.dealershipName}`, "success");
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });

  $("dealership-switch")?.addEventListener("change", async (e) => {
    const raw = e.target.value;
    if (!raw || raw === String(state.dealership?.id || "")) return;
    const body = state.crm || !/^\d+$/.test(raw) ? { crmId: raw } : { id: Number(raw) };
    const allStores = state.dealerships?.length ? state.dealerships : null;
    let next;
    try {
      next = await api("/api/dealerships/current", { method: "POST", body });
    } catch (error) {
      // The switch did not happen: keep every store in the menu and show the one still being viewed.
      if (allStores) fillDealershipSwitch(allStores);
      else e.target.value = String(state.dealership?.id || "");
      toast(error.message, "error");
      return;
    }
    if (next.crm) state.crm = true;
    state.active = null;
    state.messages = [];
    $("messages")?.replaceChildren();
    // The menu always lists every store: if the reply came back short, keep the list we already had.
    const stores = (next.dealerships || []).length >= (allStores || []).length ? next.dealerships : allStores;
    applyDealership(next.dealership, stores);
    applyAiInbound(next.aiInboundEnabled, next.aiPlatforms, next.aiTakeoverMinutes);
    // Pages with their own store picker (Dashboard) go back to following the store being viewed.
    document.dispatchEvent(new CustomEvent("dealership:switched", { detail: { id: next.dealership?.id } }));
    toast(`Viewing ${next.dealership.dealershipName}`, "success");
    try {
      await Promise.all([loadContacts(), loadStats(), loadAssignableStaff()]);
      // The new store may be another kind (inbox-only or AutoPulse CRM): refresh which pages and panels apply.
      const me = await api("/api/me").catch(() => null);
      if (me?.store) state.store = me.store;
      applyStoreKind();
      const stillThere = document.querySelector(`.rail-btn[data-view="${state.view}"]`);
      if (stillThere?.hidden) showView("dashboard");
      else if (state.view !== "inbox") showView(state.view); // Leads, Conversations, Vehicles, Dashboard… follow the switch too
    } catch (error) {
      // Switched, but a list did not reload: say so; the store menu stays complete.
      toast(`Now viewing ${next.dealership.dealershipName}, but some data did not load: ${error.message}`, "warn");
    }
  });

  $("dealership-create")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("dealership-create-error");
    err.hidden = true;
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const created = await api("/api/dealerships", { method: "POST", body: { dealership: data } });
      const next = await api("/api/dealerships/current", { method: "POST", body: { id: created.dealership.id } });
      state.active = null;
      state.messages = [];
      $("messages")?.replaceChildren();
      applyDealership(next.dealership, next.dealerships);
      e.target.reset();
      await Promise.all([loadContacts(), loadStats()]);
      toast(`${created.dealership.dealershipName} added. Its inbox is empty until a chat starts there.`, "success");
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });

  $("dealership-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("dealership-error");
    err.hidden = true;
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const next = await api("/api/settings", {
        method: "POST",
        body: { dealership: data, isDefault: $("dealership-default").checked },
      });
      applyDealership(next.dealership, next.dealerships);
      toast("Dealership saved. Its next customer message starts a fresh brain chat.", "success");
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });

  const inventoryPop = $("inventory-pop");
  const inventoryList = $("inventory-list");
  const inventorySearch = $("inventory-search");
  const selectedCars = new Map();
  let inventoryTimer = null;

  function paintInventory(cars) {
    inventoryList.replaceChildren(...cars.map((car) => {
      const id = car.vin || car.title;
      const box = h("input", { type: "checkbox" });
      box.checked = selectedCars.has(id);
      box.addEventListener("change", () => {
        if (box.checked) selectedCars.set(id, car);
        else selectedCars.delete(id);
        $("inventory-send").textContent = selectedCars.size ? `Send selected (${selectedCars.size})` : "Send selected";
      });
      const facts = [car.price, car.miles, car.place].filter(Boolean).join(" · ");
      const thumb = car.image
        ? h("img", { class: "inventory-thumb", src: car.image, alt: "" })
        : h("span", { class: "inventory-thumb inventory-thumb-empty" });
      return h("label", { class: "inventory-row" }, box, thumb, h("span", {}, car.title, facts ? h("small", { text: facts }) : null));
    }));
    $("inventory-empty").hidden = cars.length > 0;
  }

  let inventorySeq = 0;
  async function loadInventory(query) {
    const seq = ++inventorySeq;
    $("inventory-status").textContent = "Searching the lot…";
    const data = await api(`/api/inventory?q=${encodeURIComponent(query || "")}`);
    if (seq !== inventorySeq) return;
    const cars = data.cars || [];
    paintInventory(cars);
    const total = Number(data.total) || cars.length;
    $("inventory-status").textContent = cars.length
      ? (total > cars.length ? `Showing ${cars.length} of ${total}` : `${cars.length} on the lot`)
      : "";
  }

  $("inventory-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = inventoryPop.hidden;
    hideComposerPops();
    inventoryPop.hidden = !open;
    if (!inventoryPop.hidden) {
      inventorySearch.focus();
      loadInventory(inventorySearch.value).catch((error) => toast(error.message, "error"));
    }
  });
  inventoryPop.addEventListener("click", (e) => e.stopPropagation());
  inventorySearch.addEventListener("input", () => {
    clearTimeout(inventoryTimer);
    inventoryTimer = setTimeout(() => {
      loadInventory(inventorySearch.value).catch((error) => toast(error.message, "error"));
    }, 300);
  });
  $("inventory-send").addEventListener("click", async () => {
    if (!state.active || !selectedCars.size) return;
    const cars = [...selectedCars.values()].slice(0, 5);
    try {
      for (const car of cars) {
        await api(`/api/contacts/${encodeURIComponent(state.active.phone)}/messages`, {
          method: "POST",
          body: { body: car.text, ...(car.image ? { imageUrl: car.image } : {}) },
        });
      }
      selectedCars.clear();
      $("inventory-send").textContent = "Send selected";
      inventoryPop.hidden = true;
      toast(cars.length === 1 ? "Car sent" : `${cars.length} cars sent`, "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("new-chat-btn").addEventListener("click", () => {
    $("new-chat-error").hidden = true;
    $("new-chat-form").reset();
    if (state.channel === "sms" || state.channel === "whatsapp") $("new-chat-channel").value = state.channel;
    syncNewChatChannel();
    $("new-chat").showModal();
  });
  $("new-chat-channel").addEventListener("change", syncNewChatChannel);
  bindTemplateDialog();
  $("new-chat-cancel").addEventListener("click", () => $("new-chat").close());
  $("broadcast-btn")?.addEventListener("click", () => {
    $("broadcast-error").hidden = true;
    $("broadcast-form").reset();
    fillBroadcastContacts();
    $("broadcast").showModal();
  });
  $("broadcast-cancel")?.addEventListener("click", () => $("broadcast").close());
  $("room-btn")?.addEventListener("click", () => {
    $("room-error").hidden = true;
    $("room-form").reset();
    $("room-platform").querySelector('option[value="whatsapp"]').hidden = !state.metaGroupsSupported;
    $("room-platform").value = "twilio";
    $("room-platform").dispatchEvent(new Event("change"));
    $("room").showModal();
  });
  const syncRoomForm = () => {
    const platform = $("room-platform")?.value || "twilio";
    const meta = platform === "whatsapp";
    $("room-platform-field").hidden = !state.metaGroupsSupported;
    $("room-phone-field").hidden = meta;
    $("room-meta-note").hidden = !meta;
    $("room-description").textContent = meta
      ? "Meta creates an invite-only WhatsApp group. People join with the invite link, and replies stay in the group."
      : "A room only sends from the dealership number. People get a private message. Their replies stay in their own chats and are not copied to anyone else in the room.";
  };
  $("room-platform")?.addEventListener("change", syncRoomForm);
  $("room-cancel")?.addEventListener("click", () => $("room").close());
  $("room-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("room-error");
    err.hidden = true;
    const form = new FormData(e.target);
    const name = String(form.get("name") || "").trim();
    const platform = String(form.get("platform") || "twilio");
    const phones = platform === "whatsapp" ? [] : String(form.get("phones") || "").split(/[\s,;]+/).filter(Boolean);
    try {
      const created = await api("/api/groups", { method: "POST", body: { platform, subject: name } });
      let contact = created.contact;
      if (platform === "twilio") {
        for (const phone of phones) {
          const added = await api(`/api/groups/${encodeURIComponent(contact.phone)}/members`, { method: "POST", body: { phone } });
          contact = added.contact;
        }
      }
      $("room").close();
      upsertContact(contact);
      await openContact(contact.phone);
      toast(platform === "whatsapp"
        ? "Meta group creation requested. Share the invite link when Meta confirms the group."
        : "Room created. Sends go out from the dealership number only.", "success");
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });
  $("broadcast-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("broadcast-error");
    err.hidden = true;
    const form = new FormData(e.target);
    const extra = String(form.get("extra") || "").split(/[\s,;]+/).filter(Boolean);
    const phones = [...form.getAll("phones"), ...extra];
    try {
      const result = await api("/api/broadcast/lists", {
        method: "POST",
        body: { name: form.get("name"), phones, extra: extra.join("\n"), body: form.get("body") },
      });
      $("broadcast").close();
      upsertContact(result.contact);
      await openContact(result.contact.phone);
      toast(result.sent
        ? `List created. Sent to ${result.sent.sent} chat${result.sent.sent === 1 ? "" : "s"}.`
        : "Broadcast list created. Add people, then send from this thread.", "success");
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });
  $("call-btn")?.addEventListener("click", async () => {
    if (!state.active) return;
    try {
      if (isTwilio(state.active.phone) && voice.outboundEnabled) {
        await startBrowserVoiceCall();
        return;
      }
      await api(`/api/contacts/${encodeURIComponent(state.active.phone)}/call`, { method: "POST", body: { mode: "click" } });
      toast("Call request sent on WhatsApp", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("delete-room-btn")?.addEventListener("click", async () => {
    if (!isTwilioRoom(state.active) && !isMetaGroup(state.active)) return;
    const metaGroup = isMetaGroup(state.active);
    const ok = await confirmDialog({
      title: metaGroup ? "Delete this Meta WhatsApp group?" : "Delete this room?",
      text: metaGroup
        ? "This deletes the Meta-created group and removes its participants."
        : "People keep their private chats. This room is removed, and customer messages stop being copied between members.",
      okLabel: metaGroup ? "Delete group" : "Delete room",
    });
    if (!ok) return;
    try {
      const phone = state.active.phone;
      await api(`/api/groups/${encodeURIComponent(phone)}`, { method: "DELETE" });
      state.contacts = state.contacts.filter((c) => c.phone !== phone);
      state.active = null;
      $("thread").hidden = true;
      $("thread-empty").hidden = false;
      document.querySelector(".inbox")?.classList.remove("has-thread");
      renderContacts();
      toast(metaGroup ? "Meta group deleted" : "Room deleted", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  // AutoPulse super admin: delete everything about this customer (chats, profile, leads, visits, website visits).
  $("erase-customer-btn")?.addEventListener("click", () => { if (state.active) eraseCustomerFlow(state.active.phone); });
  $("delete-list-btn")?.addEventListener("click", async () => {
    if (!state.active?.isBroadcast) return;
    const ok = await confirmDialog({
      title: "Delete this list?",
      text: "People keep their private chats. Only this broadcast list is removed.",
      okLabel: "Delete list",
    });
    if (!ok) return;
    try {
      const phone = state.active.phone;
      await api(`/api/broadcast/lists/${encodeURIComponent(phone)}`, { method: "DELETE" });
      state.contacts = state.contacts.filter((c) => c.phone !== phone);
      state.active = null;
      $("thread").hidden = true;
      $("thread-empty").hidden = false;
      document.querySelector(".inbox")?.classList.remove("has-thread");
      renderContacts();
      toast("Broadcast list deleted", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("invite-btn")?.addEventListener("click", async () => {
    if (!state.active?.isGroup && !state.active?.isBroadcast) return;
    try {
      if (state.active.isBroadcast) {
        const digits = window.prompt("WhatsApp or SMS number to add (with country code)");
        if (!digits) return;
        const { contact } = await api(`/api/broadcast/lists/${encodeURIComponent(state.active.phone)}/members`, { method: "POST", body: { phone: digits } });
        upsertContact(contact);
        state.active = contact;
        renderThreadHeader();
        toast("Person added", "success");
        return;
      }
      if (String(state.active.phone).startsWith("tg:")) {
        const digits = window.prompt("WhatsApp number to add (with country code)");
        if (!digits) return;
        const { contact } = await api(`/api/groups/${encodeURIComponent(state.active.phone)}/members`, { method: "POST", body: { phone: digits } });
        upsertContact(contact);
        state.active = contact;
        renderThreadHeader();
        toast("Member added", "success");
        return;
      }
      const { contact } = await api(`/api/groups/${encodeURIComponent(state.active.phone)}/invite`, { method: "POST", body: {} });
      upsertContact(contact);
      state.active = { ...state.active, ...contact };
      renderThreadHeader();
      const link = contact.inviteLink;
      if (link && navigator.clipboard) await navigator.clipboard.writeText(link);
      toast(link ? "Invite link copied" : "Invite link not ready yet", link ? "success" : "warn");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("new-chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("new-chat-error");
    err.hidden = true;
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const result = await api("/api/contacts", { method: "POST", body: data });
      $("new-chat").close();
      upsertContact(result.contact);
      await openContact(result.contact.phone);
      if (result.windowClosed && canSendTemplate(result.contact)) {
        toast("Chat saved. Pick an approved template to start the conversation.", "info");
        openTemplateDialog();
        return;
      }
      toast(
        result.exists
          ? "This number already has a chat. Opening it."
          : result.started
            ? "Message sent"
            : result.windowClosed
              ? "Chat saved. WhatsApp is locked until this customer messages you first."
              : "Chat saved. You can message them from this thread.",
        result.exists || result.windowClosed ? "warn" : "success",
      );
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });

  $("logout-btn").addEventListener("click", async () => {
    const asDealer = Boolean(state.impersonatedBy);
    const ok = await confirmDialog({
      title: "Sign out?",
      text: asDealer ? "This signs out of this dealer view. To go back to your admin view instead, use 'Back to admin' at the top." : "You will need your e-mail and password to sign in again.",
      okLabel: "Sign out",
    });
    if (!ok) return;
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    state.sessionToken = "";
    try { sessionStorage.removeItem("autopulse.sessionToken"); } catch {}
    window.location.replace("/login");
  });

  const themeBtn = $("theme-btn");
  const syncThemeTitle = () => {
    if (!themeBtn) return;
    const light = window.autopulseTheme?.get() === "light";
    themeBtn.title = light ? "Switch to dark mode" : "Switch to light mode";
  };
  themeBtn?.addEventListener("click", () => {
    window.autopulseTheme?.toggle();
    syncThemeTitle();
  });
  syncThemeTitle();

  $("user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = $("user-error");
    err.hidden = true;
    try {
      await api("/api/users", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      form.reset();
      toast("Account created", "success");
      loadUsers();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });

  $("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = $("password-error");
    err.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    if (data.newPassword !== data.confirm) {
      err.textContent = "New passwords do not match.";
      err.hidden = false;
      return;
    }
    try {
      await api("/api/account/password", { method: "POST", body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
      const me = await api("/api/me");
      state.csrf = me.csrfToken;
      form.reset();
      toast("Password updated. Other sessions were signed out.", "success");
      connectEvents();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.active?.unread) {
      api(`/api/contacts/${encodeURIComponent(state.active.phone)}/read`, { method: "POST" }).catch(() => {});
    }
  });

  $("enable-calls-btn")?.addEventListener("click", () => setupVoice({ userGesture: true }));
  $("call-answer")?.addEventListener("click", async () => {
    if (!voice.call) return;
    try {
      await voice.call.accept();
    } catch (error) {
      toast(error.message || "Could not answer", "error");
    }
  });
  $("call-decline")?.addEventListener("click", () => {
    try { voice.call?.reject(); } catch {}
    hideCallOverlay();
  });
  $("call-hangup")?.addEventListener("click", () => {
    try { voice.call?.disconnect(); } catch {}
    hideCallOverlay();
  });
  $("call-mute")?.addEventListener("click", () => {
    if (!voice.call) return;
    voice.muted = !voice.muted;
    voice.call.mute(voice.muted);
    $("call-mute").textContent = voice.muted ? "Unmute" : "Mute";
  });
}

// Presence labels age ("On the website now" → "Last seen 2 min ago") without a server round trip.
setInterval(() => {
  if (document.hidden) return;
  if (state.contacts?.some((c) => c.presence)) renderContacts();
  if (state.active?.presence) renderThreadHeader();
}, 30_000);

/** A blocking dialog: the temporary password must be replaced (the server refuses everything else until then). */
function forcePasswordChange() {
  const dialog = $("force-password-dialog");
  const form = $("force-password-form");
  const err = $("force-password-error");
  dialog.addEventListener("cancel", (e) => e.preventDefault()); // Esc does not skip it
  $("force-password-logout").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    try { sessionStorage.removeItem("autopulse.sessionToken"); } catch {}
    window.location.replace("/login");
  });
  dialog.showModal();
  return new Promise((resolve) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;
      const fd = new FormData(form);
      if (fd.get("newPassword") !== fd.get("confirm")) { err.textContent = "The new passwords do not match"; err.hidden = false; return; }
      if (fd.get("newPassword") === fd.get("currentPassword")) { err.textContent = "Choose a password different from the temporary one"; err.hidden = false; return; }
      try {
        await api("/api/account/password", { method: "POST", body: { currentPassword: fd.get("currentPassword"), newPassword: fd.get("newPassword") } });
        dialog.close();
        toast("Password saved", "success");
        resolve();
      } catch (error) {
        err.textContent = error.message;
        err.hidden = false;
      }
    });
  });
}

// ---------- Settings → My account → Time zone ----------
function initTimeZonePanel(me) {
  const select = $("timezone-select");
  if (!select) return;
  const known = TIME_ZONE_CHOICES.some(([z]) => z === me.user?.timeZone);
  select.replaceChildren(
    h("option", { value: "", text: "New York time (default)" }),
    h("option", { value: "auto", text: `Automatic: this computer's time zone (${BROWSER_TIME_ZONE})` }),
    ...TIME_ZONE_CHOICES.filter(([z]) => z !== "America/New_York").map(([z, label]) => h("option", { value: z, text: label })),
    ...(me.user?.timeZone && me.user.timeZone !== "auto" && !known ? [h("option", { value: me.user.timeZone, text: me.user.timeZone })] : []),
  );
  select.value = me.user?.timeZone || "";
  const paintNow = () => { $("timezone-now").textContent = `Now: ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} (${currentTimeZone()})`; };
  paintNow();
  $("timezone-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await api("/api/account/time-zone", { method: "POST", body: { timeZone: select.value } });
      setAppTimeZone(res.timeZone);
      state.me = { ...state.me, timeZone: res.timeZone };
      paintNow();
      toast("Time zone saved. Lists show the new times as they refresh.", "success");
      if (state.view === "inbox") renderContacts?.();
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

async function init() {
  try { state.sessionToken = sessionStorage.getItem("autopulse.sessionToken") || ""; } catch {}
  const loginAsMatch = /^#login-as=(.+)$/.exec(location.hash);
  const openStoreMatch = /^#open-store=([^&]+)&view=([a-z-]+)$/.exec(location.hash);
  const me = await api("/api/me");
  setAppTimeZone(me.user?.timeZone || ""); // Settings → My account → Time zone
  // Store controls: AutoPulse paused this dealership's sign-in. Show why, with Sign out, instead of the inbox.
  if (me.paused) {
    document.body.append(h("div", { class: "paused-screen" }, h("div", { class: "paused-card" },
      h("h2", { text: me.pausedReason === "unsubscribed" ? "Not subscribed" : "Access paused" }),
      h("p", { class: "muted", text: me.pausedReason === "unsubscribed"
        ? "Your dealership isn't subscribed to AutoPulse Connect, so the inbox and website chat are off. Nothing has been deleted. Please contact AutoPulse to subscribe."
        : "AutoPulse has paused access to this dealership for now. Nothing has been deleted. Please contact AutoPulse." }),
      h("a", { class: "btn", href: "mailto:contact@autopulse.ai", text: "contact@autopulse.ai" }),
      h("button", { type: "button", class: "btn btn-primary", onclick: async () => { try { await api("/api/auth/logout", { method: "POST" }); } catch {} location.replace("/login"); } }, "Sign out"))));
    return;
  }
  const caps = await api("/api/platforms").catch(() => ({ platforms: {}, broadcast: false }));
  state.platforms = caps.platforms || {};
  state.broadcast = Boolean(caps.broadcast);
  state.outboundNewChats = Boolean(caps.outboundNewChats);
  state.messaging = caps.messaging || {};
  state.metaGroupsSupported = Boolean(caps.platforms?.whatsapp?.groups);
  // Store controls: channels AutoPulse switched off for this store have no Inbox tab.
  // Store controls: what AutoPulse switched off for this store (shown as "Off by AutoPulse" where it matters).
  state.aiOff = caps.aiOff || [];
  state.featuresOff = caps.featuresOff || [];
  document.body.dataset.featuresOff = state.featuresOff.join(" ");
  renderAiPlatforms();
  // An AutoPulse admin (not logged in as a dealer) sees where to change it; known here before state.me is set.
  state.restrictionsAdmin = me.user?.role === "admin" && !me.impersonatedBy;
  renderRestrictions(caps.restrictions || []);
  // Another store picked in "Viewing": show that store's restrictions.
  document.addEventListener("dealership:switched", async () => {
    const next = await api("/api/platforms").catch(() => null);
    if (!next) return;
    state.aiOff = next.aiOff || [];
    state.featuresOff = next.featuresOff || [];
    document.body.dataset.featuresOff = state.featuresOff.join(" ");
    renderAiPlatforms();
    renderRestrictions(next.restrictions || []);
  });
  for (const ch of caps.channelsOff || []) { const tab = document.querySelector(`.channel-bar .tab[data-channel="${ch}"]`); if (tab) tab.hidden = true; }
  state.roomsSupported = Boolean(state.metaGroupsSupported || (caps.platforms?.twilio?.groups && state.broadcast));
  syncChannelControls();
  state.me = me.user;
  state.impersonatedBy = me.impersonatedBy || null; // "Log in as dealer" tab (Sign out explains Back to admin)
  initTimeZonePanel(me);
  state.store = me.store || { inboxOnly: false, hasTeam: false }; // which screens apply to the store being viewed
  state.csrf = me.csrfToken;
  // Signed in with a temporary password from an admin: choose your own before anything else.
  if (me.user.mustChangePassword && !me.impersonatedBy) {
    await forcePasswordChange();
    location.reload();
    return;
  }
  if (openStoreMatch) {
    // Opened from Stores: give this tab its own session, then switch store inside it only.
    history.replaceState(null, "", location.pathname);
    try {
      const tab = await api("/api/session/tab", { method: "POST", body: {} });
      state.csrf = tab.csrfToken;
      const id = decodeURIComponent(openStoreMatch[1]);
      const local = /^local:(\d+)$/.exec(id);
      await api("/api/dealerships/current", { method: "POST", body: local ? { id: Number(local[1]) } : { crmId: id } });
      history.replaceState(null, "", `/#view=${openStoreMatch[2]}`);
      location.reload();
      return;
    } catch (error) {
      toast(error.message, "error");
    }
  }
  if (loginAsMatch) {
    history.replaceState(null, "", location.pathname);
    try {
      await api(`/api/admin/stores/${encodeURIComponent(decodeURIComponent(loginAsMatch[1]))}/login-as-token`, { method: "POST", body: {} });
      location.replace("/");
      return;
    } catch (error) {
      toast(error.message, "error");
    }
  }
  state.aiPhotoUrl = me.aiPhotoUrl || "";
  $("me-name").textContent = me.user.displayName;
  $("me-role").textContent = accountKind() === "member" ? (me.user.role === "manager" ? "Manager" : "Agent")
    : { superadmin: "AutoPulse", dealer: "Dealer", owner: "Owner", staff: "Staff", agency: "Agency" }[accountKind()] || me.user.role;
  $("me-avatar").replaceChildren(dpImg(staffDpSrc(me.user.role), "", me.user.displayName));
  $("composer-dp")?.replaceChildren(dpImg(staffDpSrc(me.user.role), "sm", me.user.displayName));
  if (me.user.role === "admin") document.querySelectorAll(".admin-only").forEach((el) => { el.hidden = false; });
  // Dealers and admins manage dealership settings such as the ADF e-mail.
  if (["admin", "manager"].includes(me.user.role) || ["superadmin", "agency", "dealer", "owner"].includes(accountKind())) {
    document.querySelectorAll(".manager-only").forEach((el) => { el.hidden = false; });
  }
  initFormChecks();
  wire();
  setupRail();
  initAccount({ $, h, api, toast, state });
  initStores({ $, h, api, toast, state, confirmDialog });
  initTeam({ $, h, api, toast, state, confirmDialog, refreshTabs: () => paintSettingsTabs($("settings-grid")?.dataset.active) });
  initStock({ $, h, api, toast, state, confirmDialog, reloadVehicles: () => loadVehiclesView() });
  initStart({ $, h, api, toast, state, showView });
  initPopups({ $, h, api, toast, confirmDialog });
  initVisitors({ $, h, api, toast, confirmDialog, showView, openContact });
  initFacebookPage({ $, h, api, toast, confirmDialog });
  initDashCharts({ $, h, api, toast, showView });
  showImpersonation(me);
  paintMeAvatar(me.user.photoUrl);
  initLeads({ $, h, api, toast, confirmDialog, openContact, showView, state, eraseCustomer: eraseCustomerFlow, isSuperAdmin });
  const owner = ["owner", "member"].includes(accountKind()); // inbox-only dealership accounts
  // "/#view=<view>[-<settings tab>][&find=<json>]": open that screen. find comes from the feature & test sheet's
  // "Show me in the app" link; Help (help.js) then highlights the button or panel a tester is looking for.
  const wantedView = /^#view=([a-z]+)(?:-([a-z]+))?(?:&find=(.+))?$/.exec(location.hash);
  if (wantedView && VIEW_META[wantedView[1]]) {
    history.replaceState(null, "", location.pathname);
    showView(wantedView[1]);
    if (wantedView[2]) setTimeout(() => document.querySelector(`#settings-tabs [data-stab="${wantedView[2]}"]`)?.click(), 300);
    if (wantedView[3]) {
      try {
        const find = { ...JSON.parse(decodeURIComponent(wantedView[3])), view: wantedView[1] };
        window.__autopulseFind = find;
        document.dispatchEvent(new CustomEvent("autopulse:find", { detail: find }));
      } catch { /* a broken link just opens the screen */ }
    }
  }
  await Promise.all([loadContacts(), loadStats(), loadAssignableStaff()]);
  // "/#chat=<chat id>" (e.g. from a customer page): open that chat.
  const wantedChat = /^#chat=(.+)$/.exec(location.hash);
  if (wantedChat) {
    history.replaceState(null, "", location.pathname);
    showView("inbox");
    openContact(decodeURIComponent(wantedChat[1]));
  }
  if (owner && !wantedView && !wantedChat) {
    // Inbox-only dealership: with chats (e.g. its website chat) start in the inbox; with none yet, on the dashboard
    // with the "AutoPulse connects your number or chat widget" note.
    const hasChats = (state.contacts || []).length > 0;
    $("owner-banner").hidden = hasChats;
    if (!hasChats) showView("dashboard");
  }
  connectEvents();
  if (!owner) setupVoice().catch(() => {});
  setInterval(loadStats, 60_000);
}

function syncComposerSend() {
  const ready = Boolean($("composer-input")?.value.trim() || state.pendingFile);
  const open = Boolean(state.active?.windowOpen) && holdDecision(state.active) !== "request";
  const list = Boolean(state.active?.isBroadcast || isTwilioRoom(state.active));
  $("send-btn").hidden = !ready;
  $("voice-btn").hidden = list || ready;
  if ($("attach-btn")) $("attach-btn").hidden = list;
  $("send-btn").disabled = !open;
  $("voice-btn").disabled = !open || list;
}

function setPendingFile(file, { voice: isVoice = false } = {}) {
  state.pendingFile = file;
  state.pendingVoice = Boolean(isVoice);
  $("attach-name").textContent = isVoice ? "Voice note — tap Send" : file.name;
  $("attach-preview").hidden = false;
  syncComposerSend();
}

function clearAttach() {
  state.pendingFile = null;
  state.pendingVoice = false;
  const input = $("attach-input");
  if (input) input.value = "";
  $("attach-preview").hidden = true;
  $("attach-name").textContent = "";
  syncComposerSend();
}

function applyMicUi(perm) {
  const btn = $("voice-btn");
  if (!btn) return;
  const blocked = perm === "denied";
  btn.classList.toggle("mic-blocked", blocked);
  btn.title = blocked
    ? "Microphone blocked — click to try again"
    : "Voice note";
  btn.setAttribute("aria-label", blocked ? "Microphone blocked" : "Voice note");
}

function explainMicBlocked() {
  return confirmDialog({
    title: "Microphone is blocked",
    text: "The browser did not allow the microphone. Click the lock icon in the address bar, set Microphone to Allow, then tap the mic again.",
    okLabel: "OK",
  });
}

function voiceMime() {
  const types = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function formatVoiceTime(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function stopVoiceTracks() {
  for (const track of voice.stream?.getTracks?.() || []) track.stop();
  voice.stream = null;
}

async function startVoice() {
  if (!window.isSecureContext) throw new Error("Voice notes need localhost or HTTPS so the browser can use the microphone.");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot record voice notes");
  if (!window.MediaRecorder) throw new Error("This browser cannot record voice notes");
  stopVoice({ discard: true });
  const mime = voiceMime();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const blocked = error.name === "NotAllowedError" || error.name === "PermissionDeniedError" || error.name === "SecurityError";
    applyMicUi(blocked ? "denied" : "unknown");
    if (blocked) {
      await explainMicBlocked();
      return;
    }
    if (error.name === "NotFoundError") throw new Error("No microphone found on this device.");
    throw new Error("Could not start the microphone.");
  }
  applyMicUi("granted");
  voice.stream = stream;
  voice.chunks = [];
  voice.mime = mime;
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  voice.recorder = recorder;
  recorder.ondataavailable = (ev) => { if (ev.data?.size) voice.chunks.push(ev.data); };
  recorder.start(250);
  voice.noteStartedAt = Date.now();
  $("voice-timer").textContent = "0:00";
  $("voice-bar").hidden = false;
  $("composer").classList.add("recording");
  $("voice-btn").classList.add("recording");
  voice.noteTimer = setInterval(() => {
    const elapsed = Date.now() - voice.noteStartedAt;
    $("voice-timer").textContent = formatVoiceTime(elapsed);
    if (elapsed >= 120000) stopVoice({ discard: false });
  }, 250);
}

function stopVoice({ discard = false } = {}) {
  const recorder = voice.recorder;
  clearInterval(voice.noteTimer);
  voice.noteTimer = null;
  $("voice-bar").hidden = true;
  $("composer")?.classList.remove("recording");
  $("voice-btn")?.classList.remove("recording");
  syncComposerSend();
  if (!recorder) {
    stopVoiceTracks();
    return;
  }
  voice.recorder = null;
  const finish = () => {
    stopVoiceTracks();
    if (discard || !voice.chunks.length) {
      voice.chunks = [];
      return;
    }
    const type = recorder.mimeType || voice.mime || "audio/webm";
    const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
    const file = new File(voice.chunks, `voice-note.${ext}`, { type: type.split(";")[0] });
    voice.chunks = [];
    if (file.size < 800) {
      toast("Voice note was too short", "warn");
      return;
    }
    setPendingFile(file, { voice: true });
  };
  if (recorder.state === "inactive") finish();
  else {
    recorder.onstop = finish;
    try { recorder.stop(); } catch { finish(); }
  }
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || "application/octet-stream",
      data: String(reader.result || "").split(",")[1] || "",
    });
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

function fillBroadcastContacts() {
  const box = $("broadcast-contacts");
  if (!box) return;
  const sendable = (state.contacts || []).filter((c) => !c.isGroup && (
    isTwilio(c.phone) || isSms(c.phone) || /^\d{6,16}$/.test(String(c.phone || ""))
  ));
  if (!sendable.length) {
    box.replaceChildren(h("p", { class: "muted", text: "No WhatsApp or SMS chats yet. Paste numbers below." }));
    return;
  }
  box.replaceChildren(...sendable.map((c) => h("label", { class: "broadcast-person" },
    h("input", { type: "checkbox", name: "phones", value: c.phone }),
    h("span", { text: displayName(c) }),
    h("span", { class: "muted", text: formatPhone(c.phone) }),
  )));
}

// ---------- Templates (Twilio Content) ----------
// Twilio WhatsApp: the WhatsApp-approved template, any time (also after the 24h window closes).
// SMS, Meta WhatsApp, Messenger, Instagram: the template's wording as a normal message while the chat is open.
function canSendTemplate(c) {
  return Boolean(c && !c.isGroup && !c.isBroadcast && !isTwilioRoom(c) && channelOf(c) !== "website");
}

function templatesUsableNow(c) {
  if (!canSendTemplate(c)) return false;
  const channel = channelOf(c);
  return channel === "twilio" || channel === "sms" || Boolean(c.windowOpen);
}

const CATALOG_KEY = "autopulse.catalogId";
const VEHICLE_ROLES = new Set(["card_title", "vehicle", "price", "mileage", "image", "button_id", "link"]);
const AGENT_ROLES = { agent: "name", agent_title: "title", agent_phone: "phone" };
const tpl = { context: null, profile: {}, picked: [], seq: 0, timer: null };

function rememberedCatalogId() {
  try { return localStorage.getItem(CATALOG_KEY) || ""; } catch { return ""; }
}

function rememberCatalogId(value) {
  try { if (value) localStorage.setItem(CATALOG_KEY, value); } catch {}
}

function templateGuess(field) {
  const ctx = tpl.context || {};
  if (field.card != null) return "";
  if (field.role === "catalog_id") return ctx.catalog_id || state.templateDefaults?.catalogId || rememberedCatalogId();
  if (AGENT_ROLES[field.role]) return tpl.profile?.[AGENT_ROLES[field.role]] || (field.role === "agent" ? ctx.agent || state.me?.displayName || "" : "");
  if (field.role && typeof ctx[field.role] === "string") return ctx[field.role];
  return "";
}

function formatAppointmentTime(raw) {
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderTemplateText(body, values) {
  return String(body || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key) => (values[key] ? values[key] : whole));
}

function selectedTemplate() {
  const sid = $("template-select").value;
  return (state.templates || []).find((t) => t.sid === sid) || null;
}

function templateValues() {
  const values = {};
  for (const input of $("template-fields").querySelectorAll("input[data-key]")) values[input.dataset.key] = input.value.trim();
  return values;
}

function sendModeText(t) {
  if (!t?.send) return "";
  if (!t.send.ok) return `Can't send here: ${t.send.reason}`;
  return t.send.mode === "content"
    ? "Sends as the WhatsApp-approved template — works even after the 24-hour window closes."
    : "Sends as a normal message, because this chat's window is open.";
}

function syncTemplatePreview() {
  const t = selectedTemplate();
  const box = $("template-preview");
  box.replaceChildren();
  $("template-send").disabled = !t?.send?.ok;
  $("template-mode").textContent = sendModeText(t);
  $("template-mode").className = `template-mode${t?.send?.ok ? "" : " blocked"}`;
  if (!t) return;
  const values = templateValues();
  box.append(h("div", { text: renderTemplateText(t.body, values) }));
  if (t.subtitle) box.append(h("div", { class: "template-subtitle", text: renderTemplateText(t.subtitle, values) }));
  if (t.buttonText) box.append(h("div", { class: "template-button", text: t.buttonText }));
  if (t.cards?.length) {
    box.append(h("div", { class: "template-carousel" }, ...t.cards.map((card) => {
      const src = renderTemplateText(card.media, values);
      return h("div", { class: "template-card-preview" },
        /^https:\/\/\S+$/i.test(src)
          ? h("img", { src, alt: "", referrerpolicy: "no-referrer" })
          : h("div", { class: "template-card-noimg", text: "Photo" }),
        h("strong", { text: renderTemplateText(card.title, values) }),
        card.body ? h("small", { text: renderTemplateText(card.body, values) }) : null,
        ...(card.buttons || []).map((button) => h("div", { class: "template-button", text: renderTemplateText(button, values) })),
      );
    })));
  }
}

// Pick cars from the lot: one per carousel card, or up to three merged into a one-vehicle template.
const MAX_SINGLE_PICKS = 3;

function vehicleSlots(t) {
  if (!t) return 0;
  if (t.cards?.length) return t.cards.length;
  return (t.fields || []).some((f) => VEHICLE_ROLES.has(f.role) && f.role !== "link") ? MAX_SINGLE_PICKS : 0;
}

function priceNumber(value) {
  const n = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function priceRange(cars) {
  const prices = cars.map((car) => priceNumber(car.price)).filter((n) => n !== null);
  if (!prices.length) return "";
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  return low === high ? money(low) : `${money(low)} – ${money(high)}`;
}

/** Several cars in one template: list the vehicles, show a price range, link the inventory page. */
function mergedCarValue(field, cars) {
  if (cars.length === 1) return carValue(field, cars[0]);
  if (field.role === "card_title" || field.role === "vehicle") return cars.map((car) => car.title).filter(Boolean).join(", ");
  if (field.role === "price") return priceRange(cars);
  if (field.role === "mileage") return cars.map((car) => car.miles).filter(Boolean).join(" / ");
  if (field.role === "link") return tpl.context?.link || cars.find((car) => car.url)?.url || "";
  return carValue(field, cars[0]);
}

function carButtonId(car) {
  return String(car.vin || car.title || "").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60);
}

function carValue(field, car) {
  if (field.role === "image") {
    const image = String(car.image || "");
    if (field.prefix) return image.startsWith(field.prefix) ? image.slice(field.prefix.length) : "";
    return image;
  }
  if (field.role === "card_title" || field.role === "vehicle") return car.title || "";
  if (field.role === "price") return car.price || "";
  if (field.role === "mileage") return car.miles || "";
  if (field.role === "button_id") return carButtonId(car);
  if (field.role === "link") return car.url || "";
  return null;
}

function fillFromCars() {
  const t = selectedTemplate();
  if (!vehicleSlots(t)) return;
  for (const input of $("template-fields").querySelectorAll("input[data-key]")) {
    const field = t.fields.find((f) => f.key === input.dataset.key);
    if (!field || !VEHICLE_ROLES.has(field.role)) continue;
    if (field.card != null) {
      const car = tpl.picked[field.card];
      const value = car ? carValue(field, car) : null;
      if (value) input.value = value;
      continue;
    }
    if (!tpl.picked.length) continue;
    const value = mergedCarValue(field, tpl.picked);
    if (value) input.value = value;
  }
  syncTemplatePreview();
}

function carsLabel(t) {
  const slots = vehicleSlots(t);
  return t?.cards?.length
    ? `Fill cards from inventory (${tpl.picked.length}/${slots})`
    : `Fill vehicles from inventory — pick up to ${slots} (${tpl.picked.length} picked)`;
}

function paintTemplateCars(cars) {
  const t = selectedTemplate();
  const max = vehicleSlots(t);
  const pickedIds = () => tpl.picked.map(carButtonId);
  $("template-car-list").replaceChildren(...cars.map((car) => {
    const box = h("input", { type: "checkbox", name: "template-car" });
    box.checked = pickedIds().includes(carButtonId(car));
    box.addEventListener("change", () => {
      if (box.checked) {
        if (tpl.picked.length >= max) {
          box.checked = false;
          toast(selectedTemplate()?.cards?.length ? `This template has ${max} cards` : `Pick up to ${max} cars`, "warn");
          return;
        }
        tpl.picked.push(car);
      } else {
        tpl.picked = tpl.picked.filter((row) => carButtonId(row) !== carButtonId(car));
      }
      $("template-cars-label").textContent = carsLabel(selectedTemplate());
      fillFromCars();
    });
    const facts = [car.price, car.miles].filter(Boolean).join(" · ");
    const thumb = car.image
      ? h("img", { class: "inventory-thumb", src: car.image, alt: "" })
      : h("span", { class: "inventory-thumb inventory-thumb-empty" });
    return h("label", { class: "inventory-row" }, box, thumb, h("span", {}, car.title, facts ? h("small", { text: facts }) : null));
  }));
}

async function loadTemplateCars(query) {
  const seq = ++tpl.seq;
  $("template-car-status").textContent = "Searching the lot…";
  try {
    const data = await api(`/api/inventory?q=${encodeURIComponent(query || "")}`);
    if (seq !== tpl.seq) return;
    const cars = data.cars || [];
    paintTemplateCars(cars);
    $("template-car-status").textContent = cars.length ? "" : "No matching cars";
  } catch (error) {
    if (seq === tpl.seq) $("template-car-status").textContent = error.message;
  }
}

function templateInput(field, t) {
  const example = t.examples?.[field.key] ? `e.g. ${t.examples[field.key]}` : "";
  return h("input", {
    "data-key": field.key,
    "data-role": field.role || "",
    "data-card": field.card ?? null,
    maxlength: "1024",
    autocomplete: "off",
    required: true,
    placeholder: field.role === "catalog_id"
      ? "Meta Commerce catalog ID"
      : field.role === "image"
        ? (field.prefix ? `path after ${field.prefix}` : "https://…/photo.jpg")
        : field.role === "datetime"
          ? "e.g. Fri, Nov 14 at 10:00 AM"
          : example,
    oninput: syncTemplatePreview,
  });
}

function fieldNote(field, input) {
  if (field.role === "customer" && !tpl.context?.customerKnown) {
    return h("small", { class: "field-note", text: "No name on file for this customer — “there” reads naturally (“Hi there”)." });
  }
  if (field.role === "agent") return h("small", { class: "field-note", text: "From My template details in Settings." });
  if (field.role === "datetime") {
    const picker = h("input", { type: "datetime-local", class: "template-when", "aria-label": "Pick date and time" });
    picker.addEventListener("change", () => {
      const text = formatAppointmentTime(picker.value);
      if (text) {
        input.value = text;
        syncTemplatePreview();
      }
    });
    return picker;
  }
  return null;
}

function renderTemplateFields() {
  const t = selectedTemplate();
  const box = $("template-fields");
  const kept = templateValues();
  box.replaceChildren();
  $("template-meta").textContent = t
    ? [t.kind && t.kind !== "text" ? t.kind : "", t.category && `${t.category.toLowerCase()} template`, t.language, t.approved ? "approved on WhatsApp" : t.status]
      .filter(Boolean).join(" · ") + (t.rejectionReason ? ` · ${t.rejectionReason}` : "")
    : "";
  const slots = vehicleSlots(t);
  $("template-cars").hidden = !slots;
  if (!t) return syncTemplatePreview();
  const fields = t.fields?.length ? t.fields : t.placeholders.map((key) => ({ key, role: "", label: "Value" }));
  const cardBoxes = new Map();
  for (const field of fields) {
    const input = templateInput(field, t);
    input.value = kept[field.key] || templateGuess(field);
    const row = h("label", { class: "field" }, h("span", { text: `${field.label} · {{${field.key}}}` }), input, fieldNote(field, input));
    if (field.card == null) {
      box.append(row);
      continue;
    }
    if (!cardBoxes.has(field.card)) {
      const group = h("fieldset", { class: "template-card" }, h("legend", { text: `Card ${field.card + 1}` }));
      cardBoxes.set(field.card, group);
      box.append(group);
    }
    cardBoxes.get(field.card).append(row);
  }
  if (slots) {
    $("template-cars-label").textContent = carsLabel(t);
    fillFromCars();
  }
  syncTemplatePreview();
}

function fillTemplateSelect() {
  const select = $("template-select");
  const current = select.value;
  const list = state.templates || [];
  select.replaceChildren(...list.map((t) => h("option", {
    value: t.sid,
    disabled: t.send ? !t.send.ok : !t.approved,
    text: `${t.name}${t.kind && t.kind !== "text" ? ` · ${t.kind}` : ""}${t.send && !t.send.ok ? " — not available here" : t.send?.mode === "text" ? " — as message" : ""}`,
  })));
  const usable = (t) => (t.send ? t.send.ok : t.approved);
  const keep = list.find((t) => t.sid === current && usable(t)) || list.find(usable);
  if (keep) select.value = keep.sid;
  if (!list.length) select.append(h("option", { value: "", text: "No templates on Twilio yet" }));
  else if (!keep) select.prepend(h("option", { value: "", text: "No template can be sent in this chat right now", selected: true }));
  renderTemplateFields();
}

function fillProfileForm() {
  const p = tpl.profile || {};
  const saved = Boolean(p.name || p.title || p.phone || p.email);
  const signer = $("template-signer-text");
  if (signer) {
    const who = [p.name || state.me?.displayName, p.title].filter(Boolean).join(", ");
    signer.textContent = saved
      ? `Signing as ${who}.`
      : `Signing as ${state.me?.displayName || "you"} — add your name and title once in Settings.`;
    $("template-signer").classList.toggle("unsaved", !saved);
  }
  const form = $("profile-form");
  if (form) {
    form.elements.name.value = p.name || state.me?.displayName || "";
    form.elements.title.value = p.title || "";
    form.elements.phone.value = p.phone || "";
    form.elements.email.value = p.email || "";
  }
}

async function loadTemplateProfile() {
  try {
    const { profile } = await api("/api/me/template-profile");
    tpl.profile = profile || {};
    fillProfileForm();
  } catch {
    // Settings still works; the form just starts empty.
  }
}

function bindProfileForm() {
  const form = $("profile-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("profile-error");
    err.hidden = true;
    const body = Object.fromEntries(new FormData(form));
    try {
      const { profile } = await api("/api/me/template-profile", { method: "POST", body });
      tpl.profile = profile;
      fillProfileForm();
      toast("Your details are saved for every template", "success");
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });
  loadTemplateProfile();
}


async function loadTemplates({ refresh = false } = {}) {
  const params = new URLSearchParams();
  if (refresh) params.set("refresh", "1");
  if (state.active?.phone) params.set("phone", state.active.phone);
  const data = await api(`/api/templates?${params}`);
  state.templates = data.templates || [];
  state.templateDefaults = data.defaults || {};
  tpl.context = data.context || null;
  tpl.profile = data.profile || {};
  fillProfileForm();
  if (data.error) toast(data.error, "warn");
  return data;
}

async function openTemplateDialog() {
  if (!canSendTemplate(state.active)) return;
  $("template-error").hidden = true;
  $("template-fields").replaceChildren();
  $("template-preview").textContent = "Loading templates…";
  $("template-mode").textContent = "";
  $("template-intro").textContent = channelOf(state.active) === "twilio" && !state.active.windowOpen
    ? "WhatsApp's 24-hour window is closed, so only WhatsApp-approved templates can be sent. When the customer replies, the chat opens again."
    : "Pick a template. Fields are filled in from this chat — check them, then send.";
  tpl.picked = [];
  $("template-car-search").value = "";
  $("template-car-list").replaceChildren();
  $("template-dialog").showModal();
  try {
    await loadTemplates();
    fillTemplateSelect();
    if (vehicleSlots(selectedTemplate())) loadTemplateCars("");
  } catch (error) {
    $("template-error").textContent = error.message;
    $("template-error").hidden = false;
  }
}

async function sendTemplateMessage(e) {
  e.preventDefault();
  const t = selectedTemplate();
  const err = $("template-error");
  err.hidden = true;
  if (!t || !state.active) return;
  $("template-send").disabled = true;
  try {
    const { message } = await api(`/api/contacts/${encodeURIComponent(state.active.phone)}/template`, {
      method: "POST",
      body: { sid: t.sid, variables: templateValues() },
    });
    if (message) upsertMessage(message);
    const catalogInput = $("template-fields").querySelector('input[data-role="catalog_id"]');
    if (catalogInput) rememberCatalogId(catalogInput.value.trim());
    $("template-dialog").close();
    toast(t.send?.mode === "text" ? "Message sent" : "Template sent", "success");
  } catch (error) {
    err.textContent = error.message;
    err.hidden = false;
  } finally {
    $("template-send").disabled = !selectedTemplate()?.send?.ok;
  }
}

function bindTemplateDialog() {
  if (!$("template-dialog")) return;
  $("template-btn").addEventListener("click", openTemplateDialog);
  $("template-tool")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openTemplateDialog();
  });
  $("template-select").addEventListener("change", () => {
    tpl.picked = [];
    $("template-fields").replaceChildren();
    renderTemplateFields();
    if (vehicleSlots(selectedTemplate()) && !$("template-car-list").children.length) loadTemplateCars($("template-car-search").value);
  });
  $("template-car-search").addEventListener("input", () => {
    clearTimeout(tpl.timer);
    tpl.timer = setTimeout(() => loadTemplateCars($("template-car-search").value), 300);
  });
  $("template-signer-edit").addEventListener("click", () => {
    $("template-dialog").close();
    showView("settings");
    setTimeout(() => {
      const form = $("profile-form");
      form?.scrollIntoView({ behavior: "smooth", block: "center" });
      form?.elements.name.focus();
    }, 60);
  });
  bindProfileForm();
  $("template-cancel").addEventListener("click", () => $("template-dialog").close());
  $("template-form").addEventListener("submit", sendTemplateMessage);
  $("template-refresh").addEventListener("click", async () => {
    try {
      await loadTemplates({ refresh: true });
      fillTemplateSelect();
      toast("Templates refreshed from Twilio", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

function syncNewChatChannel() {
  const sms = $("new-chat-channel").value === "sms";
  const soon = channelComingSoon(sms ? "sms" : "twilio");
  $("new-chat-message-field").hidden = !sms || soon;
  $("new-chat-hint").textContent = soon
    ? `Coming soon: ${sms ? "SMS" : "WhatsApp"} is not connected on this app yet.`
    : sms
      ? "Send the first SMS, or leave it blank to save the number. Use the country code, for example 17186075434."
      : "Saves a WhatsApp chat, then lets you send an approved template. Free text unlocks once the customer replies.";
  $("new-chat-ok").textContent = "Save chat";
  $("new-chat-ok").disabled = soon;
}

init().catch((error) => toast(error.message, "error"));
