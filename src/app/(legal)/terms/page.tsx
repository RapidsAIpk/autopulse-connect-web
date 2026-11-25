import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Terms and Conditions · AutoPulse" };

export default function Page() {
  return <LegacyPage name="terms" />;
}
