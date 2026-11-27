import type { Viewport } from "next";
import "../globals.css";
import { PageShell } from "@/components/site/PageShell";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// The public website at / (before sign-in), as on the old chatbot app. The dashboard is at /admin.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell bodyClass="site-page" stylesheet="/assets/site.css?v=2" help={false}>
      {children}
    </PageShell>
  );
}
