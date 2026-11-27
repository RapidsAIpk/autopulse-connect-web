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
  $("stock-mode")?.addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode); });
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

/** Vehicles view: shows the panel only for stores that can keep their own inventory. */
export async function loadStockPanel() {
  const { $, api } = ctx;
  const q = new URLSearchParams({ q: $("stock-q").value.trim(), status: $("stock-status").value });
  try {
    data = await api(`/api/stock?${q}`);
  } catch {
    $("stock-panel").hidden = true;
    return;
  }
  $("stock-panel").hidden = false;
  for (const b of $("stock-mode").querySelectorAll("[data-mode]")) {
    b.setAttribute("aria-checked", String(b.dataset.mode === data.mode));
    b.disabled = !data.canEdit;
  }
  // AutoPulse CRM dealers: always their AutoPulse feed, plus any cars added here (no feed/own switch).
  const both = data.mode === "both";
  $("stock-mode").hidden = both;
  const intro = $("stock-intro");
  if (intro && !intro.dataset.feedText) intro.dataset.feedText = intro.textContent;
  if (intro) {
    intro.textContent = both
      ? "AutoPulse feed + your own cars. Cars from the AutoPulse feed come in by themselves (read-only). Add cars here that are not in the feed: they show together with the feed cars in the website chat, AI replies, car pages and Vehicles. Use Mark sold when one is sold."
      : intro.dataset.feedText;
  }
  $("stock-own").hidden = !["own", "both"].includes(data.mode);
  for (const id of ["stock-add", "stock-import-label"]) $(id).hidden = !data.canEdit;
  $("stock-counts").textContent = `${both ? "Your own cars: " : ""}${data.counts.active} for sale · ${data.counts.sold} sold`;
  paintTable();
}

function paintTable() {
  const { $, h } = ctx;
  if (!data.items.length) {
    $("stock-body").replaceChildren(h("tr", {}, h("td", { colspan: "7", class: "muted", text: data.counts.active + data.counts.sold ? "No cars match." : (data.mode === "both" ? "No cars of your own yet. The feed's cars are listed below; add a car here that is not in the feed, or import a CSV." : "No cars yet. Add your first car, or import a CSV in the AutoPulse feed's columns.") })));
    return;
  }
  $("stock-body").replaceChildren(...data.items.map((v) => {
    const acts = data.canEdit ? [
      h("button", { type: "button", class: "btn btn-sm", text: "Edit", onclick: () => openCar(v) }),
      h("button", { type: "button", class: "btn btn-sm", text: v.status === "sold" ? "Relist" : "Mark sold", onclick: () => toggleSold(v) }),
      h("button", { type: "button", class: "btn btn-sm btn-danger", text: "Delete", onclick: () => removeCar(v) }),
    ] : [h("a", { class: "btn btn-sm", href: `/cars/${encodeURIComponent(data.website)}/${v.vin}`, target: "_blank", rel: "noopener", text: "View" })];
    return h("tr", { class: v.status === "sold" ? "sold" : "" },
      h("td", {}, v.photos[0] ? h("img", { class: "thumb", src: v.photos[0].url, alt: "", loading: "lazy" }) : h("span", { class: "thumb", text: "No photo" })),
      h("td", { class: "car" }, h("strong", { text: v.title }), h("small", { text: v.vin })),
      h("td", { text: money(v.price) }),
      h("td", { text: miles(v.miles) }),
      h("td", {}, h("span", { class: `tag ${v.status === "sold" ? "promo" : "known"}`, text: v.status === "sold" ? "Sold" : "For sale" })),
      h("td", { class: "muted", text: v.status === "sold" ? "—" : `${v.daysOnLot} d` }),
      h("td", {}, h("div", { class: "row-acts" }, ...acts)));
  }));
}

async function setMode(mode) {
  const { api, toast, confirmDialog } = ctx;
  if (!data || mode === data.mode) return;
  const text = mode === "own"
    ? "The website chat, AI replies, car pages and Vehicles will use the cars you add here instead of the AutoPulse feed."
    : "This store goes back to the AutoPulse feed. Your own cars are kept, but not shown, until you switch back.";
  if (!await confirmDialog({ title: mode === "own" ? "Use my own inventory?" : "Use the AutoPulse feed?", text, okLabel: "Switch" })) return;
  try {
    await api("/api/stock/mode", { method: "POST", body: { mode } });
    toast(mode === "own" ? "This store now uses its own inventory" : "This store now uses the AutoPulse feed", "success");
    loadStockPanel();
    ctx.reloadVehicles?.();
  } catch (error) {
    toast(error.message, "error");
  }
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
