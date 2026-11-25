"use client";

// site.js: AutoPulse's global settings (Settings → AutoPulse site) on the public pages — the uploaded dark logo
// on the wordmark, and support contacts + social links appended to the footer.
import { useGetSiteQuery } from "@/store/connectApi";

const LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X",
  youtube: "YouTube",
};

/** The sign-in and sign-up pages show the wordmark on a dark panel, so the dark logo goes there. */
export function Wordmark({ mobile = false, alt = "" }: { mobile?: boolean; alt?: string }) {
  const { data: site } = useGetSiteQuery();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={site?.logoDark || "/assets/logo-wordmark.png"}
      alt={alt}
      className={mobile ? "login-wordmark login-wordmark-mobile" : "login-wordmark"}
      width={612}
      height={266}
    />
  );
}

function FooterLink({ href, text }: { href: string; text: string }) {
  const external = /^https:/.test(href);
  return (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {text}
    </a>
  );
}

export function AuthFooter() {
  const { data: site } = useGetSiteQuery();
  return (
    <nav className="auth-footer" aria-label="AutoPulse">
      <a href="/signup">Create account</a>
      <a href="/demo">Request a demo</a>
      <a href="/contact">Contact</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      {site?.supportEmail ? <FooterLink href={`mailto:${site.supportEmail}`} text={site.supportEmail} /> : null}
      {site?.supportPhone ? (
        <FooterLink href={`tel:${site.supportPhone.replace(/[^\d+]/g, "")}`} text={site.supportPhone} />
      ) : null}
      {Object.entries(site?.links || {}).map(([key, url]) => (
        <FooterLink key={key} href={url} text={LABELS[key] || key} />
      ))}
    </nav>
  );
}
