import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Inbox · AutoPulse" };

export default function Page() {
  return <LegacyPage name="app" />;
}
