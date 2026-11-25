// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/tz.js — edit the port script, not this file.
// How the inbox shows dates and times. Each person chooses in Settings → My account → Time zone:
//  - New York time (the default, the dealers' time zone),
//  - Automatic (this computer's time zone, as before), or
//  - one time zone from the list.
// Loaded first by app.js: date formatting that does not name a time zone gets the chosen zone, and day comparisons
// ("Today", "Yesterday", chart days) use that zone's calendar day. The customer-facing website chat is unaffected.
export const DEFAULT_TIME_ZONE = "America/New_York";

const OriginalDTF = Intl.DateTimeFormat;
const originalToDateString = Date.prototype.toDateString;
/** This computer's own time zone (before any choice is applied). */
export const BROWSER_TIME_ZONE = new OriginalDTF().resolvedOptions().timeZone || "UTC";

let zone = DEFAULT_TIME_ZONE; // null = this computer's time zone
let dayKey = null;
const makeDayKey = () => (zone ? new OriginalDTF("en-US", { timeZone: zone, weekday: "short", year: "numeric", month: "short", day: "2-digit" }) : null);

/** "" (default) → New York; "auto" → this computer; otherwise a time zone name (unknown names fall back to New York). */
export function setAppTimeZone(choice = "") {
  if (choice === "auto") zone = null;
  else {
    zone = DEFAULT_TIME_ZONE;
    if (choice) {
      try { new OriginalDTF("en-US", { timeZone: choice }); zone = choice; } catch { /* keep New York */ }
    }
  }
  dayKey = makeDayKey();
  return currentTimeZone();
}

/** The time zone dates are shown in right now. */
export const currentTimeZone = () => zone || BROWSER_TIME_ZONE;

const withZone = (options) => (!zone || (options && options.timeZone) ? options : { ...(options || {}), timeZone: zone });

for (const name of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) {
  const original = Date.prototype[name];
  Object.defineProperty(Date.prototype, name, {
    configurable: true,
    writable: true,
    value: function zoned(locales, options) { return original.call(this, locales, withZone(options)); },
  });
}

// new Intl.DateTimeFormat(...) and Intl.DateTimeFormat(...) without a time zone → the chosen zone.
function ZonedDateTimeFormat(locales, options) {
  return new OriginalDTF(locales, withZone(options));
}
ZonedDateTimeFormat.prototype = OriginalDTF.prototype;
ZonedDateTimeFormat.supportedLocalesOf = OriginalDTF.supportedLocalesOf.bind(OriginalDTF);
Intl.DateTimeFormat = ZonedDateTimeFormat;

// Same-day checks compare toDateString(): make it the chosen zone's calendar day.
Object.defineProperty(Date.prototype, "toDateString", {
  configurable: true,
  writable: true,
  value: function zonedDay() {
    if (!dayKey) return originalToDateString.call(this);
    return Number.isNaN(this.getTime()) ? "Invalid Date" : dayKey.format(this);
  },
});
dayKey = makeDayKey();

/** A YYYY-MM-DD calendar day as a Date that shows as that same day in any US or nearby zone (midday UTC). */
export const calendarDay = (ymd) => new Date(`${ymd}T16:00:00Z`);

/** Time zones offered in Settings (with the default first). */
export const TIME_ZONE_CHOICES = [
  ["America/New_York", "New York (Eastern)"],
  ["America/Chicago", "Chicago (Central)"],
  ["America/Denver", "Denver (Mountain)"],
  ["America/Phoenix", "Phoenix (Arizona)"],
  ["America/Los_Angeles", "Los Angeles (Pacific)"],
  ["America/Anchorage", "Anchorage (Alaska)"],
  ["Pacific/Honolulu", "Honolulu (Hawaii)"],
  ["America/Toronto", "Toronto"],
  ["Europe/London", "London"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Karachi", "Karachi"],
  ["Asia/Kolkata", "India"],
  ["UTC", "UTC"],
];
