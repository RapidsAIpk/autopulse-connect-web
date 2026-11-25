import { fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError, FetchBaseQueryMeta } from "@reduxjs/toolkit/query/react";
import { getSessionToken, setSessionToken } from "@/lib/sessionToken";

/** Same origin: Next forwards /api to the NestJS backend (see next.config.ts, API_ORIGIN). */
export const API_BASE_URL = "/api";

/** Every failed request carries the server's own message, exactly as the old app showed it. */
export type ApiError = {
  status: number | string;
  data: { error: string; code?: string; [k: string]: unknown };
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: "include",
  prepareHeaders: (headers, { getState, arg }) => {
    const method = typeof arg === "string" ? "GET" : (arg.method || "GET").toUpperCase();
    // A caller that set its own token (the inbox keeps the tab session's CSRF) wins over the store's copy.
    const csrf = (getState() as { auth?: { csrfToken?: string } })?.auth?.csrfToken;
    if (method !== "GET" && csrf && !headers.has("x-csrf-token")) headers.set("x-csrf-token", csrf);
    const tab = getSessionToken();
    if (tab && !headers.has("x-session-token")) headers.set("x-session-token", tab);
    return headers;
  },
});

/**
 * Mirrors app.js `api()`: 401 → back to /login; a failure becomes `{ error, code? }` with the old fallback
 * text; a `sessionToken` in any response replaces this tab's session token.
 * Auth screens pass `extraOptions: { noRedirect: true }` so a 401 shows inline instead.
 */
export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, ApiError, { noRedirect?: boolean }, FetchBaseQueryMeta> = async (
  args,
  api,
  extra,
) => {
  const result = await rawBaseQuery(args, api, {});
  if (result.error) {
    const err = result.error as FetchBaseQueryError & { originalStatus?: number };
    const httpStatus = typeof err.status === "number" ? err.status : err.originalStatus;
    if (httpStatus === 401 && !extra?.noRedirect && typeof window !== "undefined") {
      setSessionToken("");
      window.location.replace("/login");
    }
    const body = (err as { data?: unknown }).data;
    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    // Auth screens (noRedirect) keep their own fallback text, so leave `error` empty when the server sent none.
    const fallback = extra?.noRedirect
      ? ""
      : httpStatus === 401
        ? "Session expired"
        : httpStatus
          ? `Request failed (${httpStatus})`
          : "Network error. Check your connection and try again.";
    return {
      error: { status: httpStatus ?? err.status, data: { ...data, error: String(data.error || fallback) } },
    };
  }
  const data = result.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "sessionToken")) {
    setSessionToken(String(data.sessionToken || ""));
  }
  return { data: result.data, meta: result.meta };
};

/** The message to show for a failed request (old app: `error.message`). */
export function errorText(err: unknown, fallback = "Something went wrong."): string {
  return (err as ApiError | undefined)?.data?.error || fallback;
}

/** HTTP status of a failed request, if the server answered. */
export function errorStatus(err: unknown): number | undefined {
  const s = (err as ApiError | undefined)?.status;
  return typeof s === "number" ? s : undefined;
}

/** A network failure (no answer at all) — the old pages showed "Network error…" for these. */
export function isNetworkError(err: unknown): boolean {
  return errorStatus(err) === undefined;
}
