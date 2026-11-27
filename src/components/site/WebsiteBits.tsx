"use client";

// The public website's live parts: the header button (Sign in / Open dashboard), old "/#…" app links forwarded to the
// dashboard, the plans from Billing, the FAQ and the footer contacts from Settings → AutoPulse site.
import { useEffect, useState } from "react";
import { useGetSiteQuery } from "@/store/connectApi";

/** Links made before the dashboard moved to /admin (log in as dealer, Stripe's return, open a chat, test sheet). */
const APP_HASH = /^#(login-as|open-store|billing|view|chat|find)=/;

export function HashForward() {
  useEffect(() => {
    if (APP_HASH.test(window.location.hash)) window.location.replace(`/admin${window.location.hash}`);
  }, []);
  return null;
}

/** Signed in already? Then the header offers the dashboard instead of Sign in. */
export function AccountButtons() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    fetch("/api/me", { credentials: "same-origin" })
      .then((r) => setSignedIn(r.ok))
      .catch(() => setSignedIn(false));
  }, []);
  return signedIn ? (
    <a className="site-btn site-btn-primary" href="/admin">Open dashboard</a>
  ) : (
    <>
      <a className="site-link" href="/login">Sign in</a>
      <a className="site-btn site-btn-primary" href="/demo">Book a demo</a>
    </>
  );
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="site-menu-btn" aria-expanded={open} aria-controls="site-mobile-nav" onClick={() => setOpen(!open)}>
        <span className="sr-only">Menu</span>
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>
      <nav id="site-mobile-nav" className="site-mobile-nav" hidden={!open} onClick={() => setOpen(false)}>
        <a href="#features">Features</a>
        <a href="#how">How it works</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
        <a href="/contact">Contact</a>
        <a href="/login">Sign in</a>
        <a href="/signup">Create account</a>
      </nav>
    </>
  );
}

type Plan = { id: number; name: string; description: string; price: string; every: string; trialDays: number };

const INCLUDED = [
  "AI website chat that knows your live inventory",
  "One inbox: website chat, WhatsApp, SMS, Messenger, Instagram",
  "Leads and visit bookings, sent to your CRM (ADF)",
  "Team, departments and chat routing",
  "Visitor insights, car pages and staff pages with QR codes",
];

export function Pricing() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((d) => setPlans(d.plans || []))
      .catch(() => setPlans([]));
  }, []);
  return (
    <div className="site-plans">
      {(plans || []).map((p) => (
        <article key={p.id} className="site-plan site-plan-main">
          <h3>{p.name}</h3>
          <p className="site-price">
            <strong>{p.price}</strong> <span>{p.every}</span>
          </p>
          {p.trialDays ? <p className="site-trial">{p.trialDays}-day free trial</p> : null}
          {p.description ? <p className="site-muted">{p.description}</p> : null}
          <ul className="site-ticks">{INCLUDED.map((x) => <li key={x}>{x}</li>)}</ul>
          <a className="site-btn site-btn-primary site-btn-block" href="/signup">Get started</a>
        </article>
      ))}
      {plans && plans.length === 0 ? (
        <article className="site-plan site-plan-main">
          <h3>AutoPulse Connect</h3>
          <p className="site-price"><strong>Talk to us</strong></p>
          <ul className="site-ticks">{INCLUDED.map((x) => <li key={x}>{x}</li>)}</ul>
          <a className="site-btn site-btn-primary site-btn-block" href="/demo">Book a demo</a>
        </article>
      ) : null}
      <article className="site-plan">
        <h3>Groups &amp; agencies</h3>
        <p className="site-price"><strong>Custom pricing</strong></p>
        <ul className="site-ticks">
          <li>Several rooftops under one account</li>
          <li>Works with AutoPulse CRM: your CRM team signs in as they are</li>
          <li>Set-up and training for your teams</li>
          <li>Everything in the dealer plan</li>
        </ul>
        <a className="site-btn site-btn-block" href="/contact">Talk to sales</a>
      </article>
    </div>
  );
}

export function SiteFooterContacts() {
  const { data: site } = useGetSiteQuery();
  const links = Object.entries(site?.links || {}) as [string, string][];
  const LABELS: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", twitter: "X", youtube: "YouTube" };
  return (
    <div className="site-foot-col">
      <h4>Talk to us</h4>
      {site?.supportEmail ? <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> : <a href="/contact">Contact form</a>}
      {site?.supportPhone ? <a href={`tel:${site.supportPhone.replace(/[^\d+]/g, "")}`}>{site.supportPhone}</a> : null}
      {links.map(([k, url]) => (
        <a key={k} href={url} target="_blank" rel="noopener">{LABELS[k] || k}</a>
      ))}
    </div>
  );
}
