// Live updates over Socket.io (replaces the old SSE stream /api/events). Shaped like an EventSource so the
// ported inbox keeps its handlers unchanged: onopen / onerror / addEventListener(name, ev => JSON.parse(ev.data)).
import { io, type Socket } from "socket.io-client";

export type LiveEvents = {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener: (event: string, handler: (ev: { data: string }) => void) => void;
  close: () => void;
};

/** Same origin unless NEXT_PUBLIC_SOCKET_URL points at the API (dev: Next's forwarding does not carry websockets). */
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;

export function openLiveEvents(sessionToken = ""): LiveEvents {
  // The socket signs in with the rapids_sid cookie, or this tab's own session token (tab sessions).
  const socket: Socket = io(SOCKET_URL, {
    withCredentials: true,
    auth: sessionToken ? { token: sessionToken } : {},
  });
  const live: LiveEvents = {
    onopen: null,
    onerror: null,
    addEventListener: (event, handler) => {
      socket.on(event, (payload: unknown) => handler({ data: JSON.stringify(payload ?? {}) }));
    },
    close: () => socket.close(),
  };
  socket.on("connect", () => live.onopen?.());
  socket.on("disconnect", (reason) => {
    live.onerror?.();
    // EventSource always retried; socket.io does not after a server-side disconnect, so retry like it did.
    if (reason === "io server disconnect") setTimeout(() => socket.connect(), 3000);
  });
  socket.on("connect_error", () => live.onerror?.());
  return live;
}
