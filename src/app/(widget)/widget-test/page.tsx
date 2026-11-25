import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Widget test page · AutoPulse" };

export default function Page() {
  return <LegacyPage name="widgetTest" />;
}
