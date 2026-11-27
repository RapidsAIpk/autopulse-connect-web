// Field-by-field checks for every form, with the same rules the API applies (GET /api/form-rules.js, built from the
// API's src/config/helpers/form-rules.ts). A wrong field gets a red border and a short message right under it as soon
// as the person leaves it; the message goes away as soon as it is fixed; nothing is sent while a field is wrong.
// When the API still refuses something it answers { error, field }, and that field is marked the same way.
const RULES_URL = "/api/form-rules.js";
let rules = null;
let loading = null;
let lastForm = null;

function loadRules() {
  if (!loading) {
    loading = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ RULES_URL)
      .then((m) => {
        rules = m;
        // Our messages replace the browser's own pop-ups on these forms.
        for (const form of document.querySelectorAll("form")) if (known(form)) form.noValidate = true;
        return m;
      })
      .catch(() => {
        loading = null; // offline or old API: the server still checks everything
        return null;
      });
  }
  return loading;
}

// The contact and demo pages share the form id "enquiry-form" but not the rules (Message is required on Contact).
function formKey(form) {
  if (!form?.id) return "";
  if (form.id === "enquiry-form") return document.body.dataset.page === "demo" || location.pathname.startsWith("/demo") ? "enquiry-demo" : "enquiry-contact";
  return form.id;
}
const known = (form) => Boolean(rules && rules.FORMS[formKey(form)]);

function values(form) {
  const all = {};
  for (const el of form.elements) if (el.name && !(el.name in all)) all[el.name] = el.type === "checkbox" ? (el.checked ? "on" : "") : el.value;
  return all;
}

// Only fields the person can see and change are checked (read-only CRM names, hidden panels are skipped).
const active = (el) => el?.name && !el.disabled && !el.readOnly && el.type !== "hidden" && el.getClientRects().length > 0;

function slotOf(el) {
  if (el._fieldError?.isConnected) return el._fieldError;
  const slot = document.createElement("div");
  slot.className = "field-error";
  slot.setAttribute("role", "alert");
  slot.id = `${el.id || el.name}-field-error-${Math.random().toString(36).slice(2, 7)}`;
  slot.hidden = true;
  el.insertAdjacentElement("afterend", slot);
  el._fieldError = slot;
  return slot;
}

function mark(el, message) {
  if (!el) return;
  const slot = message ? slotOf(el) : el._fieldError;
  el.classList.toggle("is-invalid", Boolean(message));
  if (message) {
    el.setAttribute("aria-invalid", "true");
    el.setAttribute("aria-describedby", slot.id);
  } else {
    el.removeAttribute("aria-invalid");
    if (slot && el.getAttribute("aria-describedby") === slot.id) el.removeAttribute("aria-describedby");
  }
  if (slot) {
    // The label is right above the field, so "Phone: a United States number has 10 digits" shows as
    // "A United States number has 10 digits".
    const text = String(message || "").replace(/^[^:]{1,40}:\s*/, "");
    slot.textContent = text.charAt(0).toUpperCase() + text.slice(1);
    slot.hidden = !message;
  }
}

function checkOne(form, el) {
  if (!known(form) || !active(el) || !rules.hasRule(formKey(form), el.name)) return "";
  const message = rules.check(formKey(form), el.name, values(form));
  mark(el, message);
  return message;
}

/** Checks every field of the form; marks the wrong ones and returns the first wrong field (or null). */
export function checkForm(form) {
  if (!known(form)) return null;
  let first = null;
  for (const el of form.elements) {
    if (!active(el) || !rules.hasRule(formKey(form), el.name)) continue;
    if (checkOne(form, el) && !first) first = el;
  }
  const group = rules.anyOf(formKey(form), values(form));
  if (group) {
    const el = form.elements[group.field];
    if (active(el)) {
      mark(el, group.error);
      first = first || el;
    }
  }
  return first;
}

/** The API refused a save and named the field: mark it on the form that was just sent. */
export function markServerField(data) {
  const form = lastForm;
  if (!form?.isConnected || !data?.field) return false;
  const el = form.elements[data.field];
  if (!el || el instanceof RadioNodeList) return false;
  mark(el, data.error || "Check this field");
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  lastForm = form;
  const wrong = checkForm(form);
  if (!wrong) return;
  // Stop the form's own handler: nothing is sent while a field is wrong.
  event.preventDefault();
  event.stopImmediatePropagation();
  wrong.focus({ preventScroll: true });
  wrong.scrollIntoView({ block: "center", behavior: "smooth" });
}

function onLeave(event) {
  const el = event.target;
  const form = el?.form;
  if (!form || !known(form)) return;
  if (el.value === "" && !el.classList.contains("is-invalid") && !el.dataset.touched) return; // don't nag on an empty first pass
  checkOne(form, el);
}

function onType(event) {
  const el = event.target;
  const form = el?.form;
  if (!form || !known(form) || !el.name) return;
  el.dataset.touched = "1";
  if (el.classList.contains("is-invalid")) checkOne(form, el);
  // "Confirm password" follows the password it repeats.
  const rule = rules.FORMS[formKey(form)];
  for (const [name, r] of Object.entries(rule.fields)) {
    if (r.same === el.name && form.elements[name]?.classList.contains("is-invalid")) checkOne(form, form.elements[name]);
  }
  // "E-mail or phone": typing either clears the other's message.
  for (const [a, b] of rule.anyOf || []) {
    if (el.name === a || el.name === b) for (const n of [a, b]) if (form.elements[n]?.classList.contains("is-invalid")) checkOne(form, form.elements[n]);
  }
}

// A form that is reset or reopened starts clean.
function onReset(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  for (const el of form.elements) {
    mark(el, "");
    delete el.dataset?.touched;
  }
}

let started = false;
export function initFormChecks() {
  if (started) return;
  started = true;
  loadRules();
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("focusout", onLeave, true);
  document.addEventListener("input", onType, true);
  document.addEventListener("change", onType, true);
  document.addEventListener("reset", onReset, true);
}
