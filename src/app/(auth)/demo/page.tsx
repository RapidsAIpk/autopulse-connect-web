import type { Metadata } from "next";
import { LegacyPage } from "@/components/legacy/LegacyPage";

export const metadata: Metadata = { title: "Request a demo · AutoPulse" };

export default function Page() {
  return <LegacyPage name="demo" />;
}
