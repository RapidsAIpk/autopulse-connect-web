import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Privacy Policy · AutoPulse" };

export default function Page() {
  return <LegacyPage name="privacy" />;
}
