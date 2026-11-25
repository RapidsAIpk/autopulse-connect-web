import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API = process.env.API_ORIGIN || "http://localhost:4009";

/** Same check the old server did (public.mjs loadSession): is the `rapids_sid` cookie a live session? */
async function signedIn(request: NextRequest): Promise<boolean | null> {
  if (!request.cookies.get("rapids_sid")?.value) return false;
  try {
    const res = await fetch(`${API}/api/me`, {
      headers: { cookie: request.headers.get("cookie") || "" },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return null; // API unreachable: let the page load and show its own error
  }
}

// Old routes: GET / without a session → /login; GET /login with a session → /.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const live = await signedIn(request);
  if (pathname === "/" && live === false) return NextResponse.redirect(new URL("/login", request.url));
  if (pathname === "/login" && live === true) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login"] };
