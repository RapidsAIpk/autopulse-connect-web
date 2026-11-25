import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Contact us · AutoPulse" };

export default function Page() {
  return <LegacyPage name="contact" />;
}
