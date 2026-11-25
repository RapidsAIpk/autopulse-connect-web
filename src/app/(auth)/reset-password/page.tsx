import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Choose a new password · AutoPulse" };

export default function Page() {
  return <LegacyPage name="reset" />;
}
