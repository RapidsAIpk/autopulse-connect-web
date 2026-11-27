// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/profile.js — edit the port script, not this file.
import { legacyFetch } from "@/lib/legacyFetch";
// Signed-in account screens: My profile (with photo and address), My stores (self sign-up dealers),
// and the website enquiries list for admins (Activity).
let ctx = null;

export function initAccount(deps) {
  ctx = deps;
  const { $ } = ctx;
  $("account-form")?.addEventListener("submit", saveProfile);
  $("profile-photo-input")?.addEventListener("change", uploadPhoto);
  $("profile-photo-remove")?.addEventListener("click", removePhoto);
  $("store-form")?.addEventListener("submit", checkStore);
  $("store-add")?.addEventListener("click", addStore);
  $("store-form")?.addEventListener("input", (event) => {
    if (event.target.name) {
      $("store-add").hidden = true;
      $("store-preview").hidden = true;
    }
  });
  for (const btn of document.querySelectorAll("[data-enq-kind]")) {
    btn.addEventListener("click", () => {
      enq.kind = btn.dataset.enqKind;
      enq.page = 1;
      for (const other of document.querySelectorAll("[data-enq-kind]")) other.classList.toggle("active", other === btn);
      loadEnquiries();
    });
  }
}

function showError(id, message) {
  const node = ctx.$(id);
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
}

function paintPhoto(url, name) {
  const { $, h } = ctx;
  const slot = $("profile-photo");
  if (!slot) return;
  const initials = String(name || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  slot.replaceChildren(url ? h("img", { src: url, alt: "" }) : h("span", { text: initials }));
  $("profile-photo-remove").hidden = !url;
}

/** Topbar avatar: the person's own photo when they have one. */
export function paintMeAvatar(url) {
  const { $, h } = ctx;
  if (!url) return;
  $("me-avatar")?.replaceChildren(h("img", { class: "dp sm", src: url, alt: "", draggable: "false" }));
}

export async function loadAccountPanel() {
  const { $, api } = ctx;
  let data;
  try {
    data = await api("/api/account");
  } catch (error) {
    showError("account-error", error.message);
    return;
  }
  const { profile, canChangePassword, stores } = data;
  const form = $("account-form");
  form.displayName.value = profile.displayName || "";
  form.displayName.readOnly = profile.managedByCrm;
  form.email.value = profile.email || "";
  form.email.readOnly = profile.managedByCrm;
  form.email.placeholder = profile.managedByCrm ? "From AutoPulse CRM" : "you@dealer.com — used for 'Forgot password'";
  form.phone.value = profile.phone || "";
  for (const key of ["street", "street2", "city", "state", "zip", "country"]) form[key].value = profile.address?.[key] || "";
  $("account-crm-note").hidden = !profile.managedByCrm;
  paintPhoto(profile.photoUrl, profile.displayName);
  $("password-form").hidden = !canChangePassword;
  $("password-crm-note").hidden = canChangePassword;
  const storesPanel = $("stores-panel");
  storesPanel.hidden = !stores;
  if (stores) paintStores(stores, data.currentStoreId);
}

async function saveProfile(event) {
  event.preventDefault();
  const { $, api, toast, state } = ctx;
  const form = event.currentTarget;
  showError("account-error", "");
  const body = {
    displayName: form.displayName.value,
    phone: form.phone.value,
    address: Object.fromEntries(["street", "street2", "city", "state", "zip", "country"].map((key) => [key, form[key].value])),
  };
  if (!form.email.readOnly) body.email = form.email.value;
  try {
    const { profile, emailChange } = await api("/api/account/profile", { method: "POST", body });
    $("me-name").textContent = profile.displayName;
    if (state.me) state.me.displayName = profile.displayName;
    toast(emailChange?.verify ? "Profile saved. Open the link we e-mailed to confirm your new address." : "Profile saved", "success");
  } catch (error) {
    showError("account-error", error.message);
  }
}

async function uploadPhoto(event) {
  const { toast, state } = ctx;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 1_500_000) {
    toast("Choose an image under 1.5 MB", "error");
    return;
  }
  try {
    const res = await legacyFetch("/api/account/photo", {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-csrf-token": state.csrf,
        ...(state.sessionToken ? { "x-session-token": state.sessionToken } : {}),
      },
      credentials: "same-origin",
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
    paintPhoto(data.photoUrl, state.me?.displayName);
    paintMeAvatar(data.photoUrl);
    toast("Photo updated", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function removePhoto() {
  const { api, toast, state } = ctx;
  try {
    await api("/api/account/photo/remove", { method: "POST", body: {} });
    paintPhoto("", state.me?.displayName);
    toast("Photo removed. It shows again after you reload.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

// ---------- My stores (self sign-up dealers) ----------

function paintStores(stores, currentId) {
  const { $, h } = ctx;
  $("store-list").replaceChildren(...stores.map((store) => h("li", { class: "store-row" },
    h("div", {},
      h("strong", { text: store.dealershipName }),
      h("span", { class: "muted", text: store.dealerSource }),
    ),
    Number(store.id) === Number(currentId)
      ? h("span", { class: "badge-soft", text: "Viewing" })
      : h("button", { type: "button", class: "btn btn-sm", text: "Switch", onclick: () => switchStore(store.id) }),
  )));
}

async function switchStore(id) {
  const select = ctx.$("dealership-switch");
  if (!select) return;
  select.value = String(id);
  select.dispatchEvent(new Event("change"));
  setTimeout(loadAccountPanel, 600);
}

let checkedStore = null;

async function checkStore(event) {
  event.preventDefault();
  const { $, h, api } = ctx;
  const form = $("store-form");
  showError("store-error", "");
  const body = { dealershipName: form.dealershipName.value.trim(), website: form.website.value.trim() };
  $("store-check").disabled = true;
  try {
    const { preview } = await api("/api/account/stores/preview", { method: "POST", body });
    checkedStore = body;
    const stock = preview.stock;
    const line = !stock ? "We could not check the stock right now. You can still add the store."
      : stock.total ? `${stock.total.toLocaleString("en-US")} cars found for ${preview.website}${stock.makes.length ? ` · ${stock.makes.slice(0, 3).map((m) => m.make).join(", ")}` : ""}.`
        : `No cars found for ${preview.website} in the listing feed yet. You can still add the store.`;
    $("store-preview").replaceChildren(h("p", { text: line }));
    $("store-preview").hidden = false;
    $("store-add").hidden = false;
  } catch (error) {
    showError("store-error", error.message);
  } finally {
    $("store-check").disabled = false;
  }
}

async function addStore() {
  const { $, api, toast } = ctx;
  if (!checkedStore) return;
  $("store-add").disabled = true;
  try {
    const { store, stores } = await api("/api/account/stores", { method: "POST", body: checkedStore });
    toast(`${store.dealershipName} added`, "success");
    $("store-form").reset();
    $("store-preview").hidden = true;
    $("store-add").hidden = true;
    checkedStore = null;
    const select = $("dealership-switch");
    if (select) {
      const keep = select.value;
      select.replaceChildren(...stores.map((row) => ctx.h("option", { value: String(row.id), text: row.dealershipName, selected: String(row.id) === keep })));
      select.closest(".dealer-switch").hidden = stores.length < 2;
    }
    paintStores(stores, ctx.state.dealership?.id);
  } catch (error) {
    showError("store-error", error.message);
  } finally {
    $("store-add").disabled = false;
  }
}

// ---------- website enquiries (admins, Activity) ----------

const enq = { kind: "", page: 1, perPage: 25 };

export async function loadEnquiries() {
  const { $, h, api } = ctx;
  const body = $("enq-body");
  if (!body) return;
  let data;
  try {
    data = await api(`/api/enquiries?page=${enq.page}&perPage=${enq.perPage}${enq.kind ? `&kind=${enq.kind}` : ""}`);
  } catch {
    return;
  }
  const open = $("enq-open");
  open.hidden = !data.open;
  open.textContent = `${data.open} new`;
  body.replaceChildren();
  if (!data.items.length) {
    body.append(h("tr", {}, h("td", { colspan: "7", class: "muted records-empty", text: "No enquiries yet." })));
  }
  for (const item of data.items) {
    const done = Boolean(item.handledAt);
    body.append(h("tr", { class: done ? "enq-done" : "" },
      h("td", { class: "nowrap", text: new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) }),
      h("td", {}, h("span", { class: `source-tag ${item.kind === "demo" ? "src-demo" : "src-contact"}`, text: item.kind === "demo" ? "Demo" : "Contact" })),
      h("td", { text: item.name }),
      h("td", {},
        h("a", { href: `mailto:${item.email}`, text: item.email }),
        item.phone ? h("div", { class: "muted", text: item.phone }) : null),
      h("td", {},
        h("div", { text: item.company || "—" }),
        item.website ? h("div", { class: "muted", text: item.website }) : null),
      h("td", { class: "enq-message", text: item.message || "—", title: item.message || "" }),
      h("td", {}, h("button", {
        type: "button", class: "btn btn-sm", text: done ? "Reopen" : "Mark done",
        onclick: async () => {
          await api(`/api/enquiries/${item.id}/handled`, { method: "POST", body: { handled: !done } }).catch(() => {});
          loadEnquiries();
        },
      }))));
  }
  const pages = Math.max(1, Math.ceil(data.total / data.perPage));
  const from = data.total ? (data.page - 1) * data.perPage + 1 : 0;
  $("enq-count").textContent = `Showing ${from} to ${Math.min(data.page * data.perPage, data.total)} of ${data.total} enquiries`;
  const go = (p) => { enq.page = p; loadEnquiries(); };
  const nums = [];
  for (let p = Math.max(1, data.page - 2); p <= Math.min(pages, data.page + 2); p += 1) nums.push(p);
  $("enq-pager").replaceChildren(
    h("button", { type: "button", class: "btn btn-sm", disabled: data.page <= 1, onclick: () => go(data.page - 1), "aria-label": "Previous page" }, "←"),
    ...nums.map((p) => h("button", { type: "button", class: `btn btn-sm${p === data.page ? " btn-primary" : ""}`, onclick: () => go(p) }, String(p))),
    h("button", { type: "button", class: "btn btn-sm", disabled: data.page >= pages, onclick: () => go(data.page + 1), "aria-label": "Next page" }, "→"),
  );
  if (!data.total) $("enq-count").textContent = "No enquiries";
}

// ---------- store details (Store page) ----------

const STORE_PROFILE_FIELDS = ["street", "city", "state", "zip", "country", "latitude", "longitude", "contactName", "contactPhone",
  "contactEmail", "managerPhone", "managerEmail", "callNumber", "textNumber", "timezone"];
let storeWired = false;

function paintStore(data) {
  const { $ } = ctx;
  const form = $("store-detail-form");
  if (!form) return;
  form.name.value = data.store.name || "";
  form.chatbotName.value = data.store.chatbotName || "";
  form.website.value = data.store.website || "—";
  for (const field of STORE_PROFILE_FIELDS) form[field].value = data.profile[field] || "";
  const crm = data.store.managedByCrm;
  form.name.readOnly = crm || !data.canEdit;
  form.chatbotName.readOnly = crm || !data.canEdit;
  $("store-crm-note").hidden = !crm;
  for (const field of STORE_PROFILE_FIELDS) form[field].readOnly = !data.canEdit;
  $("store-detail-save").hidden = !data.canEdit;
  $("store-geocode").hidden = !data.canEdit;
  const link = $("store-map-link");
  link.hidden = !data.mapUrl;
  if (data.mapUrl) link.href = data.mapUrl;
  $("store-embed").hidden = !data.embedCode;
  $("store-embed-none").hidden = Boolean(data.embedCode);
  $("store-embed-code").value = data.embedCode || "";
}

function wireStore() {
  if (storeWired) return;
  storeWired = true;
  const { $, api, toast } = ctx;
  $("store-detail-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    showError("store-detail-error", "");
    const body = { profile: Object.fromEntries(STORE_PROFILE_FIELDS.map((f) => [f, form[f].value])) };
    if (!form.name.readOnly) {
      body.name = form.name.value;
      body.chatbotName = form.chatbotName.value;
    }
    try {
      paintStore(await api("/api/store-profile", { method: "POST", body }));
      toast("Store details saved", "success");
    } catch (error) {
      showError("store-detail-error", error.message);
    }
  });
  $("store-geocode")?.addEventListener("click", async () => {
    const form = $("store-detail-form");
    const note = $("store-geocode-note");
    note.textContent = "Looking up…";
    try {
      const hit = await api("/api/store-profile/geocode", { method: "POST", body: Object.fromEntries(["street", "city", "state", "zip", "country"].map((f) => [f, form[f].value])) });
      form.latitude.value = hit.latitude;
      form.longitude.value = hit.longitude;
      note.textContent = `Found: ${hit.label}. Save to keep it.`;
    } catch (error) {
      note.textContent = error.message;
    }
  });
  $("store-embed-copy")?.addEventListener("click", async () => {
    const code = $("store-embed-code").value;
    try {
      await navigator.clipboard.writeText(code);
      toast("Embed code copied", "success");
    } catch {
      $("store-embed-code").select();
      toast("Press Ctrl+C (or ⌘C) to copy", "info");
    }
  });
}

export async function loadStorePanel() {
  const { api } = ctx;
  wireStore();
  try {
    paintStore(await api("/api/store-profile"));
  } catch (error) {
    showError("store-detail-error", error.message);
  }
}

// ---------- website chat widget (Store page) ----------
const WEEK = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
let widgetWired = false;

function paintWidget(data) {
  const { $, h } = ctx;
  const form = $("widget-form");
  if (!form) return;
  const w = data.widget;
  $("widget-embed").value = data.embedCode || "";
  $("widget-test-link").href = data.testUrl || "#";
  for (const f of ["botName", "welcome", "closedMessage", "whatsapp", "messenger", "instagram"]) form[f].value = w[f] || "";
  form.position.value = w.position || "right";
  form.primaryColor.value = w.primaryColor || "#2f80ed";
  form.secondaryColor.value = w.secondaryColor || "#0e1218";
  form.hoursEnabled.checked = Boolean(w.hoursEnabled);
  $("widget-hours").replaceChildren(...WEEK.map(([day, label]) => {
    const d = w.hours?.[day] || { open: "09:00", close: "18:00", closed: false };
    return h("div", { class: "hours-row" },
      h("span", { text: label }),
      h("input", { type: "time", name: `${day}-open`, value: d.open, "aria-label": `${label} opens` }),
      h("span", { class: "muted", text: "to" }),
      h("input", { type: "time", name: `${day}-close`, value: d.close, "aria-label": `${label} closes` }),
      h("label", { class: "check-row" }, h("input", { type: "checkbox", name: `${day}-closed`, checked: d.closed }), " Closed"));
  }));
  const img = (slot, url) => $(slot).replaceChildren(url ? h("img", { src: url, alt: "" }) : h("span", { class: "muted", text: "None" }));
  img("widget-logo", w.logoUrl);
  img("widget-icon", w.iconUrl);
  for (const el of form.querySelectorAll("input, select")) if (el.id !== "widget-embed") el.disabled = !data.canEdit;
  $("widget-save").hidden = !data.canEdit;
}

function wireWidget() {
  if (widgetWired) return;
  widgetWired = true;
  const { $, api, toast, state } = ctx;
  $("widget-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    showError("widget-error", "");
    const hours = Object.fromEntries(WEEK.map(([day]) => [day, { open: form[`${day}-open`].value, close: form[`${day}-close`].value, closed: form[`${day}-closed`].checked }]));
    const body = {
      botName: form.botName.value, welcome: form.welcome.value, closedMessage: form.closedMessage.value, position: form.position.value,
      whatsapp: form.whatsapp.value, messenger: form.messenger.value, instagram: form.instagram.value,
      primaryColor: form.primaryColor.value, secondaryColor: form.secondaryColor.value, hoursEnabled: form.hoursEnabled.checked, hours,
    };
    try {
      await api("/api/store-widget", { method: "POST", body });
      toast("Chat widget saved", "success");
      loadWidgetPanel();
    } catch (error) {
      showError("widget-error", error.message);
    }
  });
  $("widget-embed-copy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("widget-embed").value);
      toast("Embed code copied", "success");
    } catch {
      $("widget-embed").select();
    }
  });
  for (const kind of ["logo", "icon"]) {
    $(`widget-${kind}-input`)?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const res = await legacyFetch(`/api/store-widget/image?kind=${kind}`, {
        method: "POST",
        headers: { "content-type": file.type, "x-csrf-token": state.csrf, ...(state.sessionToken ? { "x-session-token": state.sessionToken } : {}) },
        credentials: "same-origin",
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Upload failed", "error");
      toast(kind === "logo" ? "Logo updated" : "Bubble icon updated", "success");
      loadWidgetPanel();
    });
  }
}

export async function loadWidgetPanel() {
  wireWidget();
  const panel = ctx.$("widget-panel");
  let note = document.getElementById("widget-no-site");
  try {
    paintWidget(await ctx.api("/api/store-widget"));
    panel.hidden = false;
    if (note) note.hidden = true;
  } catch (error) {
    panel.hidden = true; // no website set for this store
    // Say why the page is empty: the chat lives on the store's website, and this store has none yet.
    if (!note) {
      note = ctx.h("p", { id: "widget-no-site", class: "callout" });
      panel.before(note);
    }
    note.textContent = /website/i.test(error?.message || "")
      ? "This store has no website yet, so it has no website chat. Add the store's website (in the AutoPulse CRM for CRM dealers, or under Store details), then come back here for the chat code."
      : `The website chat settings could not be loaded: ${error?.message || "try again"}`;
    note.hidden = false;
  }
}
