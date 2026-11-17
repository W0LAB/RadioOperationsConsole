/**
 * Clock times in named time zones (net-listings.md, NETL-040–045), worked
 * out with the browser's own Intl and its time zone rules, so nothing is
 * fetched and no library is needed.
 */

/** A calendar date and clock time, as read on a wall clock somewhere. */
export interface WallTime {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
}

/** This computer's time zone by IANA name ("America/New_York"). */
export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Whether the browser knows `zone`. */
export function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Every zone the browser knows, by name, for choosing one. */
export function allZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = supported ? supported("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

const partsFormats = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partsFormat(zone: string): Intl.DateTimeFormat {
  let f = partsFormats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    partsFormats.set(zone, f);
  }
  return f;
}

/** What a wall clock in `zone` reads at `instant`. */
export function wallTime(instant: Date, zone: string): WallTime {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFormat(zone).formatToParts(instant)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAYS[p.weekday] ?? 0,
  };
}

/** How far `zone` is ahead of UTC at `ms`, in milliseconds. */
function offsetAt(ms: number, zone: string): number {
  const w = wallTime(new Date(ms), zone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return asUtc - Math.floor(ms / 60_000) * 60_000;
}

/**
 * The moment a wall clock in `zone` reads this date and time (NETL-042). A
 * time skipped when daylight-saving time starts is moved later by the gap
 * (02:30 → 03:30); a time that happens twice when it ends is the first
 * (NETL-044). `month` is 1–12; days past the month's end roll over.
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const before = offsetAt(wall - 86_400_000, zone);
  const after = offsetAt(wall + 86_400_000, zone);
  const candidates = [...new Set([wall - before, wall - after])].sort((a, b) => a - b);
  const exact = candidates.filter((t) => offsetAt(t, zone) === wall - t);
  // Skipped: read with the offset from before the change, which lands after it.
  return new Date(exact.length > 0 ? exact[0] : wall - before);
}

const shortNames = new Map<string, Intl.DateTimeFormat>();

/**
 * The zone's short name at `instant`, as a time is marked with it: "Z" for
 * UTC (as in "01:00Z"), else "EST", "CEST", or "GMT+1" where there is no
 * common abbreviation.
 */
export function zoneLabel(zone: string, instant: Date): string {
  if (zone === "UTC" || zone === "Etc/UTC") return "Z";
  let f = shortNames.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" });
    shortNames.set(zone, f);
  }
  return f.formatToParts(instant).find((p) => p.type === "timeZoneName")?.value ?? zone;
}

/** "01:00Z", "19:00 EST": a time on the clock in `zone`, marked with it. */
export function timeIn(instant: Date, zone: string): string {
  const w = wallTime(instant, zone);
  const label = zoneLabel(zone, instant);
  const hhmm = `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
  return label === "Z" ? `${hhmm}Z` : `${hhmm} ${label}`;
}

/** How a zone is named when choosing one: "UTC (Zulu)", or its name with underscores as spaces. */
export function zoneName(zone: string): string {
  return zone === "UTC" ? "UTC (Zulu)" : zone.replace(/_/g, " ");
}
