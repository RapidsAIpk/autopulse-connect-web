// Tab sessions ("open store in a new tab", "log in as dealer"): the server hands this tab its own session token,
// kept in sessionStorage and sent as X-Session-Token — same key and behaviour as the old app.js.
const KEY = "autopulse.sessionToken";

export function getSessionToken(): string {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setSessionToken(token: string) {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
