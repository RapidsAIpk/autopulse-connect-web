import type { Viewport } from "next";
import "../globals.css";
import { PageShell } from "@/components/site/PageShell";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Sign-in, sign-up, forgot/reset password, demo and contact: <body class="login-page"> in the old app.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PageShell bodyClass="login-page">{children}</PageShell>;
}
