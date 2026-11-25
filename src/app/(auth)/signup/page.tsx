import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Create a dealer account · AutoPulse" };

export default function Page() {
  return <LegacyPage name="signup" />;
}
