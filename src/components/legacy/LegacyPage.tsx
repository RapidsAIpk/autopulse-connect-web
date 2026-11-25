"use client";

// Renders an old page's exact <body> markup, then starts its ported screen code (src/legacy) once.
// The wrapper uses `display: contents`, so the old CSS sees the same layout boxes as before.
import { useEffect } from "react";
import appMarkup from "@/legacy/markup/app";
import signupMarkup from "@/legacy/markup/signup";
import forgotMarkup from "@/legacy/markup/forgot";
import resetMarkup from "@/legacy/markup/reset";
import demoMarkup from "@/legacy/markup/demo";
import contactMarkup from "@/legacy/markup/contact";
import termsMarkup from "@/legacy/markup/terms";
import privacyMarkup from "@/legacy/markup/privacy";
import widgetTestMarkup from "@/legacy/markup/widgetTest";

/** Old app.html loaded twilio-voice.min.js as a global; the ported app.js still reads window.Twilio.Device. */
async function loadVoiceSdk() {
  const { Device } = await import("@twilio/voice-sdk");
  (window as unknown as { Twilio: unknown }).Twilio = { Device };
}

const account = () => import("@/legacy/account.js").then(() => import("@/legacy/site.js"));
const site = () => import("@/legacy/site.js");

const PAGES = {
  app: { markup: appMarkup, start: () => loadVoiceSdk().catch(() => {}).then(() => import("@/legacy/app.js")) },
  signup: { markup: signupMarkup, page: "signup", start: account },
  forgot: { markup: forgotMarkup, page: "forgot", start: account },
  reset: { markup: resetMarkup, page: "reset", start: account },
  demo: { markup: demoMarkup, page: "demo", start: account },
  contact: { markup: contactMarkup, page: "contact", start: account },
  terms: { markup: termsMarkup, start: site },
  privacy: { markup: privacyMarkup, start: site },
  widgetTest: { markup: widgetTestMarkup, start: () => import("@/legacy/widget-test.js") },
} as const;

export type LegacyPageName = keyof typeof PAGES;

const started = new Set<string>();

export function LegacyPage({ name }: { name: LegacyPageName }) {
  const def = PAGES[name];
  useEffect(() => {
    if (started.has(name)) return; // the old scripts ran once per page load (also guards React dev double-effects)
    started.add(name);
    if ("page" in def) document.body.dataset.page = def.page;
    void def.start();
  }, [name, def]);
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: def.markup }} />;
}
