// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/account.js — edit the port script, not this file.
import { legacyFetch } from "@/lib/legacyFetch";
// Public account pages: sign-up with preview, forgot password, reset password, demo request, contact.
const page = document.body.dataset.page;
const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child);
  return node;
}

function show(node, message) {
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
}

async function postJson(url, body) {
  const res = await legacyFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function busy(button, on, label) {
  if (!button) return;
  if (on) button.dataset.label = button.textContent;
  button.disabled = on;
  button.textContent = on ? label : button.dataset.label || button.textContent;
}

const money = (value) => (value > 0 ? `$${Math.round(value).toLocaleString("en-US")}` : "");
const miles = (value) => (value > 0 ? `${Math.round(value).toLocaleString("en-US")} mi` : "");

// ---------- sign-up ----------
function renderPreview(p) {
  const body = $("preview-body");
  body.replaceChildren();
  body.append(
    el("dl", { class: "kv preview-kv" },
      el("dt", { text: "Dealership" }), el("dd", { text: p.dealershipName }),
      el("dt", { text: "Website" }), el("dd", { text: p.website }),
      el("dt", { text: "Chatbot name" }), el("dd", { text: p.chatbotName }),
      el("dt", { text: "Your login" }), el("dd", { text: p.email }),
    ),
  );
  const stock = p.stock;
  if (!stock) {
    body.append(el("p", { class: "hint", text: "We could not check your stock right now. You can still create the account; your cars appear once the listing feed answers." }));
    return;
  }
  if (!stock.total) {
    body.append(el("p", { class: "preview-empty", text: `We did not find cars for ${p.website} in the AutoPulse listing feed yet. You can still sign up; we will help you connect your inventory.` }));
    return;
  }
  body.append(el("p", { class: "preview-total" }, el("strong", { text: `${stock.total.toLocaleString("en-US")} cars` }), ` found for ${p.website}`));
  if (stock.dealerName || stock.dealerAddress) {
    body.append(el("p", { class: "hint", text: [stock.dealerName, stock.dealerAddress, stock.dealerPhone].filter(Boolean).join(" · ") }));
  }
  if (stock.makes.length) {
    body.append(el("div", { class: "preview-makes" }, stock.makes.map((m) => el("span", { class: "chip", text: `${m.make} ${m.count}` }))));
  }
  body.append(el("ul", { class: "preview-cars" }, stock.sample.map((car) => el("li", {},
    car.image ? el("img", { src: car.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : el("span", { class: "preview-car-ph", "aria-hidden": "true" }),
    el("span", { class: "preview-car-title", text: car.title || "Vehicle" }),
    el("span", { class: "preview-car-meta", text: [money(car.price), miles(car.miles), car.condition].filter(Boolean).join(" · ") }),
  ))));
}

function setupSignup() {
  const form = $("signup-form");
  const errorEl = form.querySelector(".form-error");
  const button = form.querySelector("button[type=submit]");
  let data = null;

  const prefill = new URLSearchParams(location.search);
  if (prefill.get("email")) form.email.value = prefill.get("email").slice(0, 120);
  if (prefill.get("name")) form.name.value = prefill.get("name").slice(0, 80);

  legacyFetch("/api/auth/options").then((r) => r.json()).then((options) => {
    const google = document.querySelector(".google-btn");
    if (google) google.hidden = !options.google;
    if (!options.signup) {
      show(errorEl, "Sign-up is not open on this server yet. Please request a demo instead.");
      button.disabled = true;
    }
  }).catch(() => {});

  const values = () => Object.fromEntries(["name", "email", "phone", "password", "dealershipName", "website", "website2"].map((k) => [k, form[k].value.trim()]));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    show(errorEl, "");
    if (form.password.value !== form.confirm.value) {
      show(errorEl, "The two passwords do not match.");
      return;
    }
    data = values();
    data.password = form.password.value;
    busy(button, true, "Checking your store…");
    try {
      const { res, data: out } = await postJson("/api/signup/preview", data);
      if (!res.ok) {
        show(errorEl, out.error || "Please check the form.");
        return;
      }
      renderPreview(out.preview);
      $("step-form").hidden = true;
      $("step-preview").hidden = false;
      $("accept-terms").checked = false;
      window.scrollTo({ top: 0 });
    } catch {
      show(errorEl, "Network error. Check your connection and try again.");
    } finally {
      busy(button, false);
    }
  });

  $("back-btn").addEventListener("click", () => {
    $("step-preview").hidden = true;
    $("step-form").hidden = false;
    show($("create-error"), "");
  });

  $("create-btn").addEventListener("click", async () => {
    if (!$("accept-terms").checked) {
      show($("create-error"), "Please accept the terms and privacy policy.");
      return;
    }
    show($("create-error"), "");
    busy($("create-btn"), true, "Creating your account…");
    try {
      const { res, data: out } = await postJson("/api/signup", { ...data, acceptTerms: true });
      if (!res.ok) {
        show($("create-error"), out.error || "Could not create the account.");
        return;
      }
      $("done-email").textContent = out.email || data.email;
      $("step-preview").hidden = true;
      $("step-done").hidden = false;
      form.password.value = "";
      form.confirm.value = "";
    } catch {
      show($("create-error"), "Network error. Check your connection and try again.");
    } finally {
      busy($("create-btn"), false);
    }
  });

  $("resend-btn").addEventListener("click", async () => {
    busy($("resend-btn"), true, "Sending…");
    await postJson("/api/signup/resend", { email: data?.email }).catch(() => {});
    busy($("resend-btn"), false);
    $("resend-note").hidden = false;
  });
}

// ---------- forgot / reset ----------
function setupForgot() {
  const form = $("forgot-form");
  const button = form.querySelector("button[type=submit]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = form.email.value.trim();
    if (!email.includes("@")) {
      show(form.querySelector(".form-error"), "Enter the e-mail you sign in with.");
      return;
    }
    show(form.querySelector(".form-error"), "");
    busy(button, true, "Sending…");
    const { res, data } = await postJson("/api/auth/forgot", { email }).catch(() => ({ res: { ok: false }, data: {} }));
    busy(button, false);
    if (!res.ok) {
      show(form.querySelector(".form-error"), data.error || "Could not send the link. Try again.");
      return;
    }
    form.querySelector(".notice").hidden = false;
    button.hidden = true;
  });
}

function setupReset() {
  const form = $("reset-form");
  const button = form.querySelector("button[type=submit]");
  const errorEl = form.querySelector(".form-error");
  const token = new URLSearchParams(location.search).get("token") || "";
  if (!token) show(errorEl, "This page needs the link from the e-mail. Ask for a new link below.");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.password.value !== form.confirm.value) {
      show(errorEl, "The two passwords do not match.");
      return;
    }
    show(errorEl, "");
    busy(button, true, "Saving…");
    const { res, data } = await postJson("/api/auth/reset", { token, password: form.password.value }).catch(() => ({ res: { ok: false }, data: {} }));
    busy(button, false);
    if (!res.ok) {
      show(errorEl, data.error || "Could not change the password.");
      return;
    }
    form.querySelector(".notice").hidden = false;
    button.hidden = true;
    history.replaceState(null, "", "/reset-password");
  });
}

// ---------- demo and contact ----------
function setupEnquiry() {
  const form = $("enquiry-form");
  const button = form.querySelector("button[type=submit]");
  const errorEl = form.querySelector(".form-error");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = { kind: form.dataset.kind };
    for (const field of form.elements) if (field.name) body[field.name] = field.value.trim();
    if (!body.name || !body.email) {
      show(errorEl, "Enter your name and e-mail.");
      return;
    }
    show(errorEl, "");
    busy(button, true, "Sending…");
    const { res, data } = await postJson("/api/public/enquiry", body).catch(() => ({ res: { ok: false }, data: {} }));
    busy(button, false);
    if (!res.ok) {
      show(errorEl, data.error || "Could not send. Please try again.");
      return;
    }
    for (const field of form.querySelectorAll(".field")) field.hidden = true;
    form.querySelector(".notice").hidden = false;
    button.hidden = true;
  });
}

if (page === "signup") setupSignup();
if (page === "forgot") setupForgot();
if (page === "reset") setupReset();
if (page === "demo" || page === "contact") setupEnquiry();
