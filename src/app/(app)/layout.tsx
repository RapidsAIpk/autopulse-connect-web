import type { Viewport } from "next";
import "../globals.css";
import { PageShell } from "@/components/site/PageShell";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

// The inbox app (old app.html): <body class="app-page">.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell bodyClass="app-page" robots="noindex, nofollow">
      {children}
    </PageShell>
  );
}
