// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/popups.js — edit the port script, not this file.
// Website chat → Pop-up messages: edit the messages that pop up next to the closed chat bubble (texts, one-tap
// buttons, timing, extras) with a live preview. Saved with the widget settings (POST /api/store-widget {popups}).
let ctx = null;
let draft = null; // the settings being edited
let opts = null; // { actions, limits, departments, defaults } from the server
let look = { botName: "Ava", color: "#2f80ed", icon: "" };
let canEdit = false;
let focus = { kind: "message", index: 0 }; // what the preview shows

const SPECIALS = [
  ["returning", "Returning visitor", "Instead of the greeting, when we know the visitor's name."],
  ["carPage", "On a car's page", "Instead of the greeting, on a page about one car (a VIN in the address)."],
  ["afterHours", "After hours", "Outside your opening hours, instead of all the messages (shown once)."],
  ["exit", "Before you go", "Once, when the mouse heads to leave the page (computers only)."],
];
const clone = (v) => JSON.parse(JSON.stringify(v));

export function initPopups(deps) {
  ctx = deps;
  const { $ } = ctx;
  $("popups-form")?.addEventListener("submit", save);
  $("popups-form")?.addEventListener("input", onInput);
  $("popups-form")?.addEventListener("change", onInput);
  $("pp-enabled")?.addEventListener("change", (e) => { if (draft) { draft.enabled = e.target.checked; paintEnabled(); } });
  $("pp-add-message")?.addEventListener("click", () => {
    if (draft.messages.length >= opts.limits.messages) return;
    draft.messages.push({ text: "", wave: false, buttons: [] });
    focus = { kind: "message", index: draft.messages.length - 1 };
    paintLists();
    ctx.$("pp-messages").lastElementChild?.querySelector("textarea")?.focus();
  });
  $("pp-reset")?.addEventListener("click", async () => {
    if (!await ctx.confirmDialog({ title: "Use our suggested messages?", text: "This replaces what is on this page with our suggestions. Nothing changes on your website until you press Save.", okLabel: "Use suggestions" })) return;
    draft = clone(opts.defaults);
    focus = { kind: "message", index: 0 };
    paintAll();
  });
  $("pp-preview-who")?.addEventListener("change", preview);
}

/** Called when the Website chat page opens. */
export async function loadPopups() {
  const { $, api } = ctx;
  if (!$("popups-panel")) return;
  try {
    const data = await api("/api/store-widget");
    opts = data.popupOptions;
    draft = clone(data.popups);
    canEdit = Boolean(data.canEdit);
    look = { botName: data.widget.botName || "Ava", color: data.widget.primaryColor || "#2f80ed", icon: data.widget.iconUrl || "" };
    $("pp-test-link").href = data.testUrl || "#";
    focus = { kind: "message", index: 0 };
    paintAll();
  } catch (error) {
    $("popups-panel").hidden = true;
  }
}

// ---------- painting ----------
function paintAll() {
  const { $ } = ctx;
  const form = $("popups-form");
  for (const f of ["firstDelay", "gap", "stay", "maxPerPage"]) form[f].value = draft[f];
  for (const f of ["animation", "onlineDot", "phones", "scrollBoost", "replyNotice"]) form[f].checked = draft[f] !== false;
  $("pp-enabled").checked = draft.enabled !== false;
  paintLists();
  paintEnabled();
}

function paintEnabled() {
  const { $ } = ctx;
  $("popups-panel").classList.toggle("pp-off", !draft.enabled);
  for (const el of $("popups-panel").querySelectorAll("input, select, textarea, button")) {
    if (["pp-test-link", "pp-preview-who"].includes(el.id)) continue;
    el.disabled = !canEdit;
  }
  $("popups-save").hidden = !canEdit;
  $("pp-reset").hidden = !canEdit;
  $("pp-add-message").hidden = !canEdit || draft.messages.length >= opts.limits.messages;
}

function paintLists() {
  const { $ } = ctx;
  $("pp-messages").replaceChildren(...draft.messages.map((m, i) => messageEditor(m, { kind: "message", index: i })));
  $("pp-specials").replaceChildren(...SPECIALS.map(([key]) => messageEditor(draft[key], { kind: key })));
  paintEnabled();
  preview();
}

function titleOf(where) {
  if (where.kind === "message") return where.index === 0 ? "Greeting" : `Reminder ${where.index}`;
  return SPECIALS.find(([k]) => k === where.kind)[1];
}

function messageEditor(m, where) {
  const { h } = ctx;
  const special = where.kind !== "message";
  const id = special ? where.kind : `m${where.index}`;
  const box = h("div", { class: `pp-msg${isFocus(where) ? " focus" : ""}${special && !m.enabled ? " off" : ""}`, "data-where": id });
  const head = h("div", { class: "pp-msg-head" });
  if (special) {
    const s = SPECIALS.find(([k]) => k === where.kind);
    head.append(h("label", { class: "check-row" }, h("input", { type: "checkbox", "data-f": "enabled", checked: m.enabled !== false }), h("strong", { text: s[1] })), h("small", { class: "muted", text: s[2] }));
  } else {
    head.append(h("strong", { text: titleOf(where) }));
    const tools = h("span", { class: "pp-tools" });
    if (where.index > 0) tools.append(h("button", { type: "button", class: "btn btn-xs", "data-do": "up", title: "Move up", "aria-label": "Move up", text: "↑" }));
    if (where.index < draft.messages.length - 1) tools.append(h("button", { type: "button", class: "btn btn-xs", "data-do": "down", title: "Move down", "aria-label": "Move down", text: "↓" }));
    if (draft.messages.length > 1) tools.append(h("button", { type: "button", class: "btn btn-xs danger", "data-do": "remove", title: "Remove this message", "aria-label": "Remove this message", text: "✕" }));
    head.append(tools);
  }
  const text = h("textarea", { "data-f": "text", rows: "2", maxlength: String(opts.limits.text), placeholder: "What the message says, e.g. Hi {name}! Looking for a car?" });
  text.value = m.text || "";
  const count = h("small", { class: "pp-count muted", text: `${text.value.length}/${opts.limits.text}` });
  const body = h("div", { class: "pp-msg-body" },
    h("label", { class: "field" }, h("span", { text: "Message" }), text, count),
    h("label", { class: "check-row" }, h("input", { type: "checkbox", "data-f": "wave", checked: Boolean(m.wave) }), " Waving hand 👋 next to the picture"),
    h("div", { class: "pp-buttons" }, h("span", { class: "pp-sub", text: `Buttons (up to ${opts.limits.buttons})` }), ...(m.buttons || []).map((b, i) => buttonEditor(b, i))),
  );
  if ((m.buttons || []).length < opts.limits.buttons) body.append(h("button", { type: "button", class: "btn btn-xs", "data-do": "add-button", text: "+ Add a button" }));
  box.append(head, body);
  box.addEventListener("focusin", () => setFocus(where));
  box.addEventListener("click", (e) => {
    setFocus(where);
    const btn = e.target.closest("[data-do]");
    if (btn && canEdit) act(btn.dataset.do, where, Number(btn.closest("[data-b]")?.dataset.b));
  });
  return box;
}

function buttonEditor(b, i) {
  const { h } = ctx;
  const action = h("select", { "data-bf": "action", "aria-label": "What the button does" }, ...Object.entries(opts.actions).map(([k, label]) => h("option", { value: k, text: label, selected: b.action === k })));
  const dept = h("select", { "data-bf": "department", "aria-label": "Department" }, h("option", { value: "", text: "Department: let them choose" }), ...opts.departments.map((d) => h("option", { value: d.id, text: `Department: ${d.label}`, selected: b.department === d.id })));
  const row = h("div", { class: "pp-btn", "data-b": String(i) },
    h("input", { "data-bf": "label", maxlength: String(opts.limits.label), placeholder: "Button text, e.g. 🚗 Show me cars", value: b.label || "", "aria-label": "Button text" }),
    action,
    b.action === "ask" ? h("input", { "data-bf": "text", maxlength: String(opts.limits.question), placeholder: "The question it sends, e.g. Show me your SUVs", value: b.text || "", "aria-label": "Question it sends", class: "wide" }) : null,
    b.action === "ask" || b.action === "book" ? dept : null,
    b.action === "link" ? h("input", { "data-bf": "url", type: "url", maxlength: String(opts.limits.url), placeholder: "https://… (opens in a new tab)", value: b.url || "", "aria-label": "Web address", class: "wide" }) : null,
    h("button", { type: "button", class: "btn btn-xs danger", "data-do": "remove-button", title: "Remove this button", "aria-label": "Remove this button", text: "✕" }));
  return row;
}

// ---------- editing ----------
const isFocus = (w) => w.kind === focus.kind && (w.kind !== "message" || w.index === focus.index);
function setFocus(where) {
  if (isFocus(where)) return;
  focus = where;
  for (const el of ctx.$("popups-panel").querySelectorAll(".pp-msg")) el.classList.toggle("focus", el.dataset.where === (where.kind === "message" ? `m${where.index}` : where.kind));
  preview();
}
const target = (where) => (where.kind === "message" ? draft.messages[where.index] : draft[where.kind]);
const whereOf = (el) => {
  const id = el.closest(".pp-msg")?.dataset.where;
  if (!id) return null;
  return id.startsWith("m") && /^m\d+$/.test(id) ? { kind: "message", index: Number(id.slice(1)) } : { kind: id };
};

function act(what, where, b) {
  const list = draft.messages;
  const m = target(where);
  if (what === "up" || what === "down") {
    const j = where.index + (what === "up" ? -1 : 1);
    [list[where.index], list[j]] = [list[j], list[where.index]];
    focus = { kind: "message", index: j };
  } else if (what === "remove") {
    list.splice(where.index, 1);
    focus = { kind: "message", index: Math.max(0, where.index - 1) };
  } else if (what === "add-button") {
    m.buttons.push({ label: "", action: "ask", text: "", department: "", url: "" });
  } else if (what === "remove-button") {
    m.buttons.splice(b, 1);
  } else return;
  paintLists();
}

function onInput(e) {
  if (!draft) return;
  const el = e.target;
  const form = ctx.$("popups-form");
  if (["firstDelay", "gap", "stay", "maxPerPage"].includes(el.name)) draft[el.name] = el.value === "" ? "" : Number(el.value);
  if (["animation", "onlineDot", "phones", "scrollBoost", "replyNotice"].includes(el.name)) draft[el.name] = el.checked;
  const where = whereOf(el);
  if (!where) return void preview();
  const m = target(where);
  if (el.dataset.f === "text") { m.text = el.value; el.parentElement.querySelector(".pp-count").textContent = `${el.value.length}/${opts.limits.text}`; }
  if (el.dataset.f === "wave") m.wave = el.checked;
  if (el.dataset.f === "enabled") { m.enabled = el.checked; el.closest(".pp-msg").classList.toggle("off", !el.checked); }
  if (el.dataset.bf) {
    const b = m.buttons[Number(el.closest("[data-b]").dataset.b)];
    b[el.dataset.bf] = el.value;
    if (el.dataset.bf === "action" && e.type === "change") { paintLists(); form.querySelector(`[data-where="${where.kind === "message" ? `m${where.index}` : where.kind}"] [data-b] select`)?.focus(); return; }
  }
  preview();
}

// ---------- preview (looks like the widget's pop-up) ----------
function fill(text, name) {
  return String(text || "").replace(/(,\s*|\s)?\{name\}/gi, (m, pre) => (name ? `${pre || ""}${name}` : "")).replace(/\{bot\}/gi, look.botName).trim();
}

function preview() {
  const { $, h } = ctx;
  if (!draft) return;
  const name = $("pp-preview-who").value;
  const m = target(focus) || draft.messages[0];
  const off = !draft.enabled || (focus.kind !== "message" && m.enabled === false);
  const ava = look.icon ? h("img", { class: "pp-ava", src: look.icon, alt: "" }) : h("span", { class: "pp-ava", text: look.botName.slice(0, 1).toUpperCase() });
  const card = h("div", { class: "pp-card" },
    h("div", { class: "pp-row" }, h("span", { class: "pp-avw" }, ava, m.wave ? h("span", { class: "pp-wave", text: "👋" }) : null),
      h("div", {}, h("div", { class: "pp-head" }, h("b", { text: look.botName }), h("span", { class: "pp-live", text: "Online now" })),
        h("div", { class: "pp-text", text: fill(m.text, name) || "…" }))),
    (m.buttons || []).length ? h("div", { class: "pp-chips" }, ...m.buttons.map((b) => h("span", { class: "pp-chip", text: fill(b.label, name) || "Button" }))) : null,
    h("span", { class: "pp-x", text: "×" }));
  const bubble = h("div", { class: "pp-bubble" }, h("span", { class: "pp-bav" }), h("span", { text: look.botName }), draft.onlineDot ? h("span", { class: "pp-dot" }) : null);
  const stage = $("pp-stage");
  stage.style.setProperty("--pp", look.color);
  stage.classList.toggle("off", off);
  stage.replaceChildren(card, bubble);
  const what = titleOf(focus);
  const action = (b) => (b.action === "ask" ? `sends “${fill(b.text, name)}”${b.department ? ` (${opts.departments.find((d) => d.id === b.department)?.label})` : ""}` : opts.actions[b.action]?.toLowerCase() || "");
  $("pp-preview-note").textContent = off ? `${what}: turned off, so it is not shown.`
    : `${what}.${(m.buttons || []).length ? ` Buttons: ${m.buttons.map((b) => `${fill(b.label, name) || "?"} → ${action(b)}`).join("; ")}.` : ""}`;
}

// ---------- saving ----------
async function save(event) {
  event.preventDefault();
  const { $, api, toast } = ctx;
  const err = $("popups-error");
  err.hidden = true;
  $("popups-save").disabled = true;
  try {
    const res = await api("/api/store-widget", { method: "POST", body: { popups: draft } });
    draft = clone(res.popups);
    paintAll();
    toast("Pop-up messages saved. Your website shows them within 5 minutes.", "success");
  } catch (error) {
    err.textContent = error.message;
    err.hidden = false;
  } finally {
    $("popups-save").disabled = !canEdit;
  }
}
