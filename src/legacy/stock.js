// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/stock.js — edit the port script, not this file.
import { legacyFetch } from "@/lib/legacyFetch";
// Vehicles → Inventory (stores without AutoPulse CRM): stock source (AutoPulse feed / My own inventory), and the
// store's own cars: add, edit, fill in from the VIN, photos (upload, order, remove), sold / relist, delete, CSV.
let ctx = null;
let data = null;
let editing = null; // the car open in the dialog (after its first save)
let timer = null;

const money = (n) => (n ? `$${Math.round(n).toLocaleString("en-US")}` : "Call for price");
const miles = (n) => (n || n === 0 ? `${Math.round(n).toLocaleString("en-US")} mi` : "—");
const FIELDS = ["vin", "year", "make", "model", "trim", "bodyType", "condition", "price", "msrp", "miles", "exteriorColor", "interiorColor", "transmission", "drivetrain", "fuelType", "engine", "doors", "cityMpg", "highwayMpg", "description"];

export function initStock(deps) {
  ctx = deps;
  const { $ } = ctx;
  // Another store chosen in Viewing: never show (or act on) the previous store's inventory panel.
  document.addEventListener("dealership:switched", () => { data = null; if ($("stock-panel")) $("stock-panel").hidden = true; });
  $("stock-q")?.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(loadStockPanel, 300); });
  $("stock-status")?.addEventListener("change", loadStockPanel);
  $("stock-add")?.addEventListener("click", () => openCar(null));
  $("stock-export")?.addEventListener("click", () => { window.location.href = "/api/stock/export"; });
  $("stock-import")?.addEventListener("change", importCsv);
  $("stock-cancel")?.addEventListener("click", () => { $("stock-dialog").close(); loadStockPanel(); });
  $("stock-form")?.addEventListener("submit", saveCar);
  $("stock-decode")?.addEventListener("click", decode);
  $("stock-photo-input")?.addEventListener("change", uploadPhotos);
}

function showErr(message) {
  const node = ctx.$("stock-error");
  node.textContent = message || "";
  node.hidden = !message;
}

/**
 * Vehicles view, one design for every store. The panel says where the cars come from (tick boxes: the AutoPulse
 * feed, My own cars, or both; AutoPulse CRM dealers always keep the feed) and holds Add car / Import / Export.
 * Every car, feed or own, is listed once, in the Vehicles table below (own cars there have Edit / Mark sold /
 * Delete). Only sold own cars are listed in the panel, to relist or delete them.
 */
export async function loadStockPanel() {
  const { $, api } = ctx;
  try {
    data = await api("/api/stock");
  } catch {
    $("stock-panel").hidden = true;
    return;
  }
  $("stock-panel").hidden = false;
  paintSources();
  const src = data.sources || { feed: data.mode !== "own", own: data.mode !== "feed" };
  const intro = $("stock-intro");
  if (intro) {
    intro.textContent = src.own && src.feed
      ? "This store shows the AutoPulse feed and your own cars together. Feed cars come in by themselves (read-only); add cars that are not in the feed with Add car. Every car is in the list below."
      : src.own
        ? "This store shows only the cars you add here (not the AutoPulse feed). They appear in the website chat, AI replies, car pages and the list below."
        : "This store shows the AutoPulse feed (read-only). Tick My own cars to add cars that are not in the feed.";
  }
  $("stock-own").hidden = !src.own;
  for (const id of ["stock-q", "stock-status"]) if ($(id)) $(id).hidden = true; // search and filters are in the list below
  for (const id of ["stock-add", "stock-import-label"]) $(id).hidden = !data.canEdit;
  $("stock-counts").textContent = `Your own cars: ${data.counts.active} for sale · ${data.counts.sold} sold`;
  paintTable();
}

function paintSources() {
  const { $, h } = ctx;
  const box = $("stock-mode");
  const src = data.sources || { feed: data.mode !== "own", own: data.mode !== "feed" };
  const tick = (key, label, locked, title) => {
    const input = h("input", { type: "checkbox", id: `stock-src-${key}` });
    input.checked = Boolean(src[key]);
    input.disabled = !data.canEdit || locked;
    input.addEventListener("change", () => setSources(key, input));
    return h("label", { class: "stock-src", title }, input, " ", label);
  };
  box.classList.remove("seg");
  box.classList.add("stock-sources");
  box.setAttribute("role", "group");
  box.replaceChildren(
    h("span", { class: "muted", text: "Cars from:" }),
    tick("feed", "AutoPulse feed", data.feedLocked, data.feedLocked ? "AutoPulse CRM dealers always keep their AutoPulse feed" : "Cars from the AutoPulse car feed (read-only)"),
    tick("own", "My own cars", false, "Cars you add here"),
  );
  box.hidden = false;
}

function paintTable() {
  const { $, h } = ctx;
  const sold = data.items.filter((v) => v.status === "sold");
  const head = $("stock-own").querySelector("thead")?.closest("table");
  if (head) head.hidden = !sold.length;
  let title = document.getElementById("stock-sold-title");
  if (!title && head) { title = h("h4", { id: "stock-sold-title", class: "stock-sold-title" }); head.before(title); }
  if (title) { title.textContent = `Sold cars (${sold.length}): relist or delete`; title.hidden = !sold.length; }
  $("stock-body").replaceChildren(...sold.map((v) => {
    const acts = data.canEdit ? [
      h("button", { type: "button", class: "btn btn-sm", text: "Edit", onclick: () => openCar(v) }),
      h("button", { type: "button", class: "btn btn-sm", text: "Relist", onclick: () => toggleSold(v) }),
      h("button", { type: "button", class: "btn btn-sm btn-danger", text: "Delete", onclick: () => removeCar(v) }),
    ] : [];
    return h("tr", { class: "sold" },
      h("td", {}, v.photos[0] ? h("img", { class: "thumb", src: v.photos[0].url, alt: "", loading: "lazy" }) : h("span", { class: "thumb", text: "No photo" })),
      h("td", { class: "car" }, h("strong", { text: v.title }), h("small", { text: v.vin })),
      h("td", { text: money(v.price) }),
      h("td", { text: miles(v.miles) }),
      h("td", {}, h("span", { class: "tag promo", text: "Sold" })),
      h("td", { class: "muted", text: "—" }),
      h("td", {}, h("div", { class: "row-acts" }, ...acts)));
  }));
}

/** A tick box changed: feed only, own cars only, or both (at least one stays ticked). */
async function setSources(key, input) {
  const { api, toast, confirmDialog, $ } = ctx;
  const feed = $("stock-src-feed").checked;
  const own = $("stock-src-own").checked;
  if (!feed && !own) { input.checked = true; toast("Keep at least one: the AutoPulse feed or your own cars", "warn"); return; }
  const mode = feed && own ? "both" : own ? "own" : "feed";
  const text = mode === "own"
    ? "The website chat, AI replies, car pages and Vehicles will show only the cars you add here, not the AutoPulse feed."
    : mode === "feed"
      ? "Your own cars are kept but no longer shown; only the AutoPulse feed is shown."
      : "Your own cars will show together with the AutoPulse feed everywhere: website chat, AI replies, car pages and Vehicles.";
  if (!await confirmDialog({ title: "Change where this store's cars come from?", text, okLabel: "Change" })) { input.checked = !input.checked; return; }
  try {
    await api("/api/stock/mode", { method: "POST", body: { mode } });
    toast(mode === "both" ? "AutoPulse feed and your own cars are shown" : mode === "own" ? "Only your own cars are shown" : "Only the AutoPulse feed is shown", "success");
    loadStockPanel();
    ctx.reloadVehicles?.();
  } catch (error) {
    input.checked = !input.checked;
    toast(error.message, "error");
  }
}

/** Edit / Mark sold / Delete for a car added in Connect, as small icons in its Vehicles row. */
export function ownCarButtons(ownId) {
  const { h, api, toast } = ctx;
  if (!ownId || data?.canEdit === false) return [];
  const withCar = (fn) => async () => {
    try { fn((await api(`/api/stock/${ownId}`)).vehicle); } catch (error) { toast(error.message, "error"); }
  };
  const icon = (label, d, onclick, extra = "") => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
    return h("button", { type: "button", class: `icon-btn${extra}`, title: label, "aria-label": label, onclick }, svg);
  };
  return [
    icon("Edit this car", "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3", withCar(openCar)),
    icon("Mark sold", "M5 12.5l4.5 4.5L19 7.5", withCar(toggleSold)),
    icon("Delete this car", "M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3", withCar(removeCar), " danger"),
  ];
}

function fill(vehicle) {
  const form = ctx.$("stock-form");
  for (const key of FIELDS) if (form.elements[key]) form.elements[key].value = vehicle?.[key] ?? "";
  for (const key of ["certified", "carfaxOneOwner", "carfaxCleanTitle"]) form.elements[key].checked = Boolean(vehicle?.[key]);
  form.elements.features.value = (vehicle?.features || []).map((f) => (f.category && f.category !== "Other" ? `${f.category}: ${f.description}` : f.description)).join("\n");
  form.elements.condition.value = vehicle?.condition || "used";
}

function openCar(vehicle) {
  const { $ } = ctx;
  editing = vehicle;
  $("stock-form").reset();
  showErr("");
  fill(vehicle);
  $("stock-title").textContent = vehicle ? `Edit ${vehicle.title}` : "Add car";
  $("stock-save").textContent = vehicle ? "Save changes" : "Save car";
  paintPhotos();
  $("stock-dialog").showModal();
}

function formBody() {
  const fd = new FormData(ctx.$("stock-form"));
  const body = {};
  for (const key of FIELDS) body[key] = String(fd.get(key) ?? "").trim();
  for (const key of ["certified", "carfaxOneOwner", "carfaxCleanTitle"]) body[key] = fd.get(key) === "on";
  body.features = String(fd.get("features") || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return body;
}

async function saveCar(event) {
  event.preventDefault();
  const { $, api, toast } = ctx;
  showErr("");
  try {
    const body = formBody();
    if (editing) {
      editing = (await api(`/api/stock/${editing.id}`, { method: "PATCH", body })).vehicle;
      toast("Car saved", "success");
      $("stock-dialog").close();
      loadStockPanel();
      ctx.reloadVehicles?.();
    } else {
      editing = (await api("/api/stock", { method: "POST", body })).vehicle;
      toast("Car added. Now add its photos.", "success");
      $("stock-title").textContent = `Edit ${editing.title}`;
      $("stock-save").textContent = "Save changes";
      paintPhotos();
      loadStockPanel();
      ctx.reloadVehicles?.();
    }
  } catch (error) {
    showErr(error.message);
  }
}

async function decode() {
  const { $, api, toast } = ctx;
  const form = $("stock-form");
  const vin = form.elements.vin.value.trim().toUpperCase();
  showErr("");
  const btn = $("stock-decode");
  btn.disabled = true;
  btn.textContent = "Looking up…";
  try {
    const { vehicle } = await api(`/api/stock/decode?vin=${encodeURIComponent(vin)}`);
    for (const [key, value] of Object.entries(vehicle)) {
      const input = form.elements[key];
      if (input && value !== null && value !== "" && !String(input.value).trim()) input.value = value;
    }
    toast(`${vehicle.year} ${vehicle.make} ${vehicle.model}: details filled in. Check them, add price and miles.`, "success");
  } catch (error) {
    showErr(error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Fill in from VIN";
  }
}

function paintPhotos() {
  const { $, h } = ctx;
  const photos = editing?.photos || [];
  $("stock-photo-label").hidden = !editing;
  $("stock-photos-hint").hidden = Boolean(editing);
  $("stock-photos").replaceChildren(...photos.map((p, i) => h("div", { class: "stock-photo" },
    h("img", { src: p.url, alt: "" }),
    i === 0 ? h("span", { class: "cover", text: "Cover" }) : null,
    h("div", { class: "ph-acts" },
      h("button", { type: "button", title: "Move left", "aria-label": "Move left", disabled: i === 0, onclick: () => movePhoto(i, -1) }, "←"),
      h("button", { type: "button", title: "Remove", "aria-label": "Remove photo", onclick: () => movePhoto(i, 0) }, "✕"),
      h("button", { type: "button", title: "Move right", "aria-label": "Move right", disabled: i === photos.length - 1, onclick: () => movePhoto(i, 1) }, "→")))));
}

async function movePhoto(index, dir) {
  const { api, toast } = ctx;
  const ids = editing.photos.map((p) => p.id);
  if (dir === 0) ids.splice(index, 1);
  else [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
  try {
    editing = (await api(`/api/stock/${editing.id}`, { method: "PATCH", body: { photos: ids } })).vehicle;
    paintPhotos();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function upload(path, bytes, type) {
  const { state } = ctx;
  const res = await legacyFetch(path, {
    method: "POST", credentials: "same-origin", body: bytes,
    headers: { "content-type": type, "x-csrf-token": state.csrf, ...(state.sessionToken ? { "x-session-token": state.sessionToken } : {}) },
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Upload failed (${res.status})`);
  return out;
}

async function uploadPhotos(event) {
  const { toast } = ctx;
  const files = [...(event.target.files || [])];
  event.target.value = "";
  for (const file of files) {
    if (file.size > 5_000_000) { toast(`${file.name} is over 5 MB`, "error"); continue; }
    try {
      editing = (await upload(`/api/stock/${editing.id}/photos`, file, file.type || "application/octet-stream")).vehicle;
      paintPhotos();
    } catch (error) {
      toast(`${file.name}: ${error.message}`, "error");
    }
  }
}

async function toggleSold(v) {
  const { api, toast } = ctx;
  try {
    await api(`/api/stock/${v.id}/sold`, { method: "POST", body: { sold: v.status !== "sold" } });
    toast(v.status === "sold" ? `${v.title} is for sale again` : `${v.title} marked sold. It is no longer offered anywhere.`, "success");
    loadStockPanel();
    ctx.reloadVehicles?.();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function removeCar(v) {
  const { api, toast, confirmDialog } = ctx;
  if (!await confirmDialog({ title: `Delete ${v.title}?`, text: "It is removed from the inventory with its photos. Leads on it keep their car details. To keep a record, use Mark sold instead.", okLabel: "Delete" })) return;
  try {
    await api(`/api/stock/${v.id}`, { method: "DELETE" });
    toast("Car deleted", "success");
    loadStockPanel();
    ctx.reloadVehicles?.();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function importCsv(event) {
  const { $, toast } = ctx;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const note = $("stock-import-result");
  note.hidden = false;
  note.textContent = "Importing…";
  try {
    const r = await upload("/api/stock/import", file, "text/csv");
    note.textContent = `${r.added} added, ${r.updated} updated${r.failed ? `, ${r.failed} skipped: ${r.results.slice(0, 5).map((x) => `row ${x.row} (${x.error})`).join("; ")}` : ""}.`;
    loadStockPanel();
    ctx.reloadVehicles?.();
  } catch (error) {
    note.textContent = error.message;
    toast(error.message, "error");
  }
}
