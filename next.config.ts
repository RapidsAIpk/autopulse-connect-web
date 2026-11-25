import type { NextConfig } from "next";

const API = process.env.API_ORIGIN || "http://localhost:4009";

// Paths the NestJS backend keeps serving (API, its own rendered pages, webhooks, media, the widget).
// Next only forwards them, so the browser sees one origin exactly like the old single-server app.
const BACKEND_PATHS = [
  "/api/:path*",
  "/widget.js",
  "/cars/:path*",
  "/d/:path*",
  "/customer/:path*",
  "/me/:path*",
  "/media/:path*",
  "/guide",
  "/guide/:path*",
  "/sheet/:path*",
  "/webhook",
  "/webhook/meta/:path*", // Rapids AI Meta app: Messenger webhooks (/webhook/meta/rapids, /webhook/meta/rapids-test)
  "/meta/connect/callback", // Connect Facebook Page: Facebook sends the dealer back here
  "/twilio/:path*",
  "/verify-email",
  "/auth/google",
  "/auth/google/:path*",
  "/healthz",
  "/readyz",
];

const nextConfig: NextConfig = {
  // The dev "N" badge sits on top of the rail's "Collapse menu" button.
  devIndicators: false,
  // Self-contained server (.next/standalone) so the Contabo box only needs Node 22, no node_modules install.
  output: "standalone",
  async rewrites() {
    return BACKEND_PATHS.map((source) => ({ source, destination: `${API}${source}` }));
  },
};

export default nextConfig;
