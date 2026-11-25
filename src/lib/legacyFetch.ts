// The ported inbox screens make every request through RTK Query (connectApi.request), via this fetch-shaped
// wrapper, so their response handling (res.ok / res.status / res.json()) stays byte-for-byte the old code.
import { store } from "@/store";
import { connectApi } from "@/store/connectApi";

export type LegacyResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export async function legacyFetch(url: string, init: RequestInit = {}): Promise<LegacyResponse> {
  const headers: Record<string, string> = {};
  new Headers(init.headers || {}).forEach((v, k) => (headers[k] = v));
  const action = store.dispatch(
    connectApi.endpoints.request.initiate({
      url: url.replace(/^\/api(?=\/|$)/, ""),
      method: (init.method || "GET").toUpperCase(),
      headers,
      body: init.body ?? undefined,
    }),
  );
  const result = await action;
  action.reset();
  // Every HTTP status comes back as data (validateStatus), so an error here means no answer at all.
  if ("error" in result && result.error) throw new TypeError("Failed to fetch");
  const { status, raw } = result.data as { status: number; raw: string };
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(raw),
    text: async () => raw,
  };
}
