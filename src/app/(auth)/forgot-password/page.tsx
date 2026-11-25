import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Forgot password · AutoPulse" };

export default function Page() {
  return <LegacyPage name="forgot" />;
}
