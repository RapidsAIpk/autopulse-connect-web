import type { Viewport } from "next";
import { PageShell } from "@/components/site/PageShell";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// The widget QA page (old widget/test.html): its own stylesheet, no theme, no help, loads /widget.js like a dealer site.
export default function WidgetTestLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell help={false} theme={false} stylesheet="/assets/widget-test.css?v=1" robots="noindex">
      {children}
    </PageShell>
  );
}
