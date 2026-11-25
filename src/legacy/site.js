// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/site.js — edit the port script, not this file.
import { legacyFetch } from "@/lib/legacyFetch";
// Public pages: AutoPulse's global settings (Settings → AutoPulse site): uploaded logo, support contacts, social links.
const LABELS = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", twitter: "X", youtube: "YouTube" };

legacyFetch("/api/site").then((r) => (r.ok ? r.json() : null)).then((site) => {
  if (!site) return;
  // The sign-in and sign-up pages show the wordmark on a dark panel, so the dark logo goes there.
  if (site.logoDark) for (const img of document.querySelectorAll(".login-wordmark")) img.src = site.logoDark;
  const footer = document.querySelector(".auth-footer");
  if (!footer) return;
  const add = (href, text) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    if (/^https:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
    footer.append(a);
  };
  if (site.supportEmail) add(`mailto:${site.supportEmail}`, site.supportEmail);
  if (site.supportPhone) add(`tel:${site.supportPhone.replace(/[^\d+]/g, "")}`, site.supportPhone);
  for (const [key, url] of Object.entries(site.links || {})) add(url, LABELS[key] || key);
}).catch(() => {});
