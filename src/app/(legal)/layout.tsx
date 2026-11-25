import type { Viewport } from "next";
import "../globals.css";
import { PageShell } from "@/components/site/PageShell";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Terms and Privacy: <body class="legal-page"> in the old app.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <PageShell bodyClass="legal-page">{children}</PageShell>;
}
