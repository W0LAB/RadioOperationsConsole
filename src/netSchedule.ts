import type { NetListing, NetSession } from "./types";
import { pad2 } from "./utils";
import { isDaylightTime, keepsDaylightTime, localZone, timeIn, wallTime, zonedInstant, zoneLabel } from "./timeZones";

/**
 * When listed nets meet (docs/features/net-listings.md), worked out from
 * their schedules in each listing's time zone and shown in this computer's
 * (NETL-040–045). Nothing is stored per meeting (NETL-023).
 */

/** One meeting of a net. */
export interface Meeting {
  start: Date;
  end: Date;
  /** Started and not yet over. */
  underway: boolean;
}

/** A weekly net meeting on this many weekdays or more is listed once, under Daily (NETL-020). */
export const DAILY_MIN_DAYS = 5;

/** How long a net with no end time counts as under way (NETL-020). */
const ASSUMED_MINUTES = 60;
/** Far enough ahead to reach any monthly meeting. */
const LOOKAHEAD_DAYS = 62;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK_NAMES: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", last: "last" };

export const WEEKDAY_OPTIONS = DAY_SHORT.map((label, value) => ({ value, label }));
export const WEEK_OPTIONS = ["1", "2", "3", "4", "last"].map((value) => ({
  value,
  label: WEEK_NAMES[value],
}));

/** A session with the zone its listing's times are written in: all a schedule needs. */
export type Schedule = NetSession & { time_zone: string };

/**
 * One session of a listing, with the listing's own fields: what one line of
 * the week shows (NETL-020, NETL-021). `id` is the listing's.
 */
export interface NetLine extends Omit<NetListing, "sessions">, NetSession {
  /** Which of its listing's sessions, from 0. */
  session: number;
  /** Unique per line: the listing's id and session. */
  key: string;
  /** The listing it is a session of. */
  listing: NetListing;
}

/** A listing's sessions as lines, in order. */
export function linesOf(l: NetListing): NetLine[] {
  const { sessions, ...shared } = l;
  return sessions.map((s, session) => ({ ...shared, ...s, session, key: `${l.id}#${session}`, listing: l }));
}

/** The zone a listing's days and times are written in; this computer's if it has none yet. */
export function zoneOf(l: { time_zone: string }): string {
  return l.time_zone || localZone();
}

/** Whether the listing's times are in a zone other than this computer's. */
export function isOtherZone(l: { time_zone: string }): boolean {
  return zoneOf(l) !== localZone();
}

/**
 * The season at `instant` for a session of this listing (NETL-046): summer
 * while the listing's zone keeps daylight-saving time, or this computer's
 * for a zone that doesn't; null when neither does.
 */
function seasonAt(l: { time_zone: string }, instant: Date): "summer" | "winter" | null {
  const year = instant.getUTCFullYear();
  const zone = [zoneOf(l), localZone()].find((z) => keepsDaylightTime(z, year));
  if (!zone) return null;
  return isDaylightTime(instant, zone) ? "summer" : "winter";
}

/** Whether a meeting starting at `instant` is in the session's season (NETL-008). */
function inSeason(l: Schedule, instant: Date): boolean {
  if (!l.season) return true;
  const now = seasonAt(l, instant);
  return now == null || now === l.season;
}

/**
 * A season-only session's season, after its name, when neither zone keeps
 * daylight-saving time so both seasons are listed (NETL-046): "summer". Else "".
 */
export function seasonMark(l: Schedule, now: Date = new Date()): string {
  return l.season && seasonAt(l, now) == null ? l.season : "";
}

/** A calendar date with no time zone, held as midnight UTC so date arithmetic is plain. */
const civil = (year: number, month0: number, day: number) => new Date(Date.UTC(year, month0, day));

function isLastWeek(c: Date): boolean {
  const daysInMonth = civil(c.getUTCFullYear(), c.getUTCMonth() + 1, 0).getUTCDate();
  return c.getUTCDate() + 7 > daysInMonth;
}

/** Whether the net meets on this calendar date, read in its own zone (NETL-003, NETL-042). */
function meetsOnCivil(l: Schedule, c: Date): boolean {
  if (l.schedule_kind === "as_needed" || !l.weekdays.includes(c.getUTCDay())) return false;
  if (l.schedule_kind === "weekly") return true;
  const week = Math.ceil(c.getUTCDate() / 7);
  return l.weeks.some((w) => (w === "last" ? isLastWeek(c) : Number(w) === week));
}

/** Whether the net meets on the calendar date `day` (read by its local date), in its own zone (NETL-003). */
export function meetsOn(l: Schedule, day: Date): boolean {
  return meetsOnCivil(l, civil(day.getFullYear(), day.getMonth(), day.getDate()));
}

/** Weekly or monthly, all day or at a time. */
const hasTime = (l: Schedule) =>
  l.schedule_kind !== "as_needed" && (l.all_day || /^\d\d:\d\d$/.test(l.start_time));

/** The meeting on calendar date `c` in the listing's zone, at its times there (NETL-042, NETL-044). */
function meetingOnCivil(l: Schedule, c: Date, now: Date): Meeting {
  const zone = zoneOf(l);
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return zonedInstant(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate(), h, m, zone);
  };
  if (l.all_day) {
    // From the start of its day to the start of the next, in its zone (NETL-004).
    const start = at("00:00");
    const next = civil(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate() + 1);
    const end = zonedInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, zone);
    return { start, end, underway: start <= now && now < end };
  }
  const start = at(l.start_time);
  const end = l.end_time ? at(l.end_time) : new Date(start.getTime() + ASSUMED_MINUTES * 60_000);
  return { start, end, underway: start <= now && now < end };
}

/** The net's meetings in season that overlap `from`–`to`, soonest first (NETL-008). */
function meetingsBetween(l: Schedule, from: Date, to: Date, now: Date): Meeting[] {
  if (!hasTime(l)) return [];
  const zone = zoneOf(l);
  const first = wallTime(from, zone);
  const last = wallTime(to, zone);
  const out: Meeting[] = [];
  // From the day before, for a meeting begun then and still going.
  for (let c = civil(first.year, first.month - 1, first.day - 1); c <= civil(last.year, last.month - 1, last.day); ) {
    if (meetsOnCivil(l, c)) {
      const m = meetingOnCivil(l, c, now);
      if (m.end > from && m.start < to && inSeason(l, m.start)) out.push(m);
    }
    c = civil(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate() + 1);
  }
  return out;
}

/** `days` days after `d`'s local date, at local midnight. */
const localDay = (d: Date, days = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/**
 * The meeting under way now, else the next one; null for "as needed" (or a
 * schedule with no time).
 */
export function nextMeeting(l: Schedule, now: Date): Meeting | null {
  return meetingsBetween(l, now, localDay(now, LOOKAHEAD_DAYS + 1), now)[0] ?? null;
}

/**
 * When a season-only session out of season now is next in season: its first
 * meeting then, within a year; null if in season or as needed (NETL-008).
 */
export function backInSeason(l: Schedule, now: Date): Meeting | null {
  if (!l.season || !hasTime(l) || nextMeeting(l, now)) return null;
  return meetingsBetween(l, now, localDay(now, 370), now)[0] ?? null;
}

/** "Summer only", "Winter only · from Mar 14" when out of season now; "" all year (NETL-008). */
export function seasonNote(l: Schedule, now: Date): string {
  if (!l.season) return "";
  const only = l.season === "summer" ? "Summer only" : "Winter only";
  const back = backInSeason(l, now);
  return back ? `${only} · from ${MONTH_SHORT[back.start.getMonth()]} ${back.start.getDate()}` : only;
}

/** One net meeting. */
export interface DayEntry {
  listing: NetLine;
  meeting: Meeting;
}

/** One session of a net under one weekday of the week. */
export interface WeekEntry {
  listing: NetLine;
  /** Its next meeting on this weekday (today's while not over); null if none in reach. */
  meeting: Meeting | null;
  /** Met earlier today and is over. */
  overToday: boolean;
}

/** One weekday of the week, the same whatever day it is. */
export interface WeekDay {
  /** 0 = Sunday. */
  weekday: number;
  /** "Sunday". */
  name: string;
  today: boolean;
  /** By start time, then name. */
  entries: WeekEntry[];
}

export interface WeekView {
  /**
   * Weekly nets meeting most days (`DAILY_MIN_DAYS` or more), listed once
   * apart from the days so the days show what sets each apart; by time.
   */
  daily: WeekEntry[];
  /** Sunday to Saturday, without the daily nets. */
  days: WeekDay[];
  /** "As needed" sessions, by name. */
  asNeeded: NetLine[];
}

const byName = (a: NetLine, b: NetLine) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.session - b.session;

/**
 * Where a net falls in the week here (NETL-043): for each weekday it is
 * written on, the local weekday of its first meeting from today on, that
 * meeting, and the next one not over (today's while it isn't).
 */
function placesInWeek(
  l: Schedule,
  now: Date
): { weekday: number; first: Meeting | null; next: Meeting | null }[] {
  const today = localDay(now);
  const zone = zoneOf(l);
  const meetings = meetingsBetween(l, today, localDay(now, LOOKAHEAD_DAYS + 1), now).filter(
    (m) => m.start >= today
  );
  return [...l.weekdays].sort((a, b) => a - b).map((written) => {
    const onIt = meetings.filter((m) => wallTime(m.start, zone).weekday === written);
    const first = onIt[0] ?? null;
    return {
      weekday: first ? first.start.getDay() : written,
      first,
      next: onIt.find((m) => m.end > now) ?? null,
    };
  });
}

/** The net's meetings today here, if any, are all over. */
function overToday(l: Schedule, now: Date): boolean {
  const today = meetingsBetween(l, localDay(now), localDay(now, 1), now).filter(
    (m) => isoDate(m.start) === isoDate(now)
  );
  return today.length > 0 && today.every((m) => m.end <= now);
}

/** Whether the net is listed once under Daily rather than under each weekday (NETL-020). */
export function isDaily(l: Schedule): boolean {
  return l.schedule_kind === "weekly" && l.weekdays.length >= DAILY_MIN_DAYS;
}

/**
 * The nets' sessions by weekday, Sunday to Saturday, so the week looks the
 * same whatever day it is (NETL-020): each session under every weekday it
 * meets on (a monthly one too), by start time, except those meeting most
 * days, which are listed once under Daily at their next meeting. Today is
 * marked; its sessions carry today's meeting, and one already over says so.
 * A session out of season is left out (NETL-008).
 */
export function weekView(listings: NetListing[], now: Date): WeekView {
  const lines = listings.flatMap(linesOf);
  const scheduled = lines.filter((l) => hasTime(l) && (!l.season || nextMeeting(l, now) != null));
  // By the time here (NETL-043); a net with no meeting in reach by its written time. All-day nets first (NETL-028).
  const timeOf = (e: WeekEntry) =>
    e.listing.all_day ? "" : e.meeting ? hhmm(e.meeting.start) : e.listing.start_time;
  const byTime = (a: WeekEntry, b: WeekEntry) => timeOf(a).localeCompare(timeOf(b)) || byName(a.listing, b.listing);
  const daily = scheduled
    .filter(isDaily)
    .map((listing) => ({
      listing,
      meeting: nextMeeting(listing, now),
      // An all-day net is never over, nor marked (NETL-028).
      overToday: !listing.all_day && overToday(listing, now),
    }))
    .sort(byTime);
  const byWeekday: WeekEntry[][] = DAY_NAMES.map(() => []);
  for (const listing of scheduled.filter((l) => !isDaily(l))) {
    const seen = new Set<number>();
    for (const place of placesInWeek(listing, now)) {
      if (seen.has(place.weekday)) continue;
      seen.add(place.weekday);
      const isToday = place.first != null && isoDate(place.first.start) === isoDate(now);
      byWeekday[place.weekday].push({
        listing,
        meeting: place.next,
        overToday:
          !listing.all_day &&
          isToday &&
          place.first!.end <= now &&
          !(place.next && isoDate(place.next.start) === isoDate(now)),
      });
    }
  }
  const days = DAY_NAMES.map((name, weekday) => ({
    weekday,
    name,
    today: weekday === now.getDay(),
    entries: byWeekday[weekday].sort(byTime),
  }));
  const asNeeded = lines.filter((l) => l.schedule_kind === "as_needed").sort(byName);
  return { daily, days, asNeeded };
}

/**
 * Which days a daily net meets, after its name, as they fall here: "Mon–Fri",
 * "Sun–Thu"; "" every day (NETL-020, NETL-043).
 */
export function dailyDays(l: Schedule, now: Date = new Date()): string {
  if (!isDaily(l) || l.weekdays.length >= 7) return "";
  return weeklyDays(isOtherZone(l) ? placesInWeek(l, now).map((p) => p.weekday) : l.weekdays);
}

/** Which weeks of the month a monthly net meets: "2nd & 4th", "last"; "" when weekly. */
export function monthlyWeeks(l: Schedule): string {
  return l.schedule_kind === "monthly" ? andList(l.weeks.map((w) => WEEK_NAMES[w] ?? w)) : "";
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * The sessions for "Coming up" (NETL-025): those on now or starting within
 * the next `hours`, each once at its next meeting, soonest first.
 */
export function comingUp(listings: NetListing[], now: Date, hours = 12): DayEntry[] {
  const until = now.getTime() + hours * 60 * 60_000;
  return listings
    .flatMap(linesOf)
    // Always on, so never coming up (NETL-025, NETL-028).
    .filter((l) => !l.all_day)
    .flatMap((listing) => {
      const meeting = nextMeeting(listing, now);
      return meeting && meeting.start.getTime() < until ? [{ listing, meeting }] : [];
    })
    .sort((a, b) => a.meeting.start.getTime() - b.meeting.start.getTime() || byName(a.listing, b.listing));
}

/**
 * When a meeting starts, as a glance would want it: "On now · until 08:00",
 * "in 25 min", "in 2 h 10 min" (within 12 hours), else "Tomorrow 07:30",
 * "Wed 21:00" (within the week), "Thu Oct 15 20:00".
 */
export function startsIn(m: Meeting, now: Date): string {
  if (m.underway) return `On now · until ${hhmm(m.end)}`;
  const mins = Math.round((m.start.getTime() - now.getTime()) / 60_000);
  if (mins < 60) return `in ${Math.max(mins, 1)} min`;
  if (mins < 12 * 60) return `in ${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}`;
  const days = Math.round(
    (new Date(m.start.getFullYear(), m.start.getMonth(), m.start.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  if (days === 0) return `Today ${hhmm(m.start)}`;
  if (days === 1) return `Tomorrow ${hhmm(m.start)}`;
  if (days < 7) return `${DAY_SHORT[m.start.getDay()]} ${hhmm(m.start)}`;
  return `${DAY_SHORT[m.start.getDay()]} ${MONTH_SHORT[m.start.getMonth()]} ${m.start.getDate()} ${hhmm(m.start)}`;
}

/** "Tuesdays", "Mon–Fri", "Sun–Thu", "Mon, Wed, Fri", "Daily". */
function weeklyDays(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  if (days.length === 7) return "Daily";
  if (days.length === 1) return `${DAY_NAMES[days[0]]}s`;
  // Three or more days in a row, as a range.
  if (days.length >= 3 && days.every((d, i) => i === 0 || d === days[i - 1] + 1)) {
    return `${DAY_SHORT[days[0]]}–${DAY_SHORT[days[days.length - 1]]}`;
  }
  return days.map((d) => DAY_SHORT[d]).join(", ");
}

function andList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

/**
 * "Tuesdays 19:00–19:30", "2nd & 4th Thursday 20:00", "As needed" (NETL-021),
 * in the listing's own zone, which is named when it isn't this computer's:
 * "Wednesdays 01:00 UTC" (NETL-045).
 */
export function describeSchedule(l: Schedule, now: Date = new Date()): string {
  if (l.schedule_kind === "as_needed") return "As needed";
  const days =
    l.schedule_kind === "weekly"
      ? weeklyDays(l.weekdays)
      : `${andList(l.weeks.map((w) => WEEK_NAMES[w] ?? w))} ${
          l.weekdays.length === 1
            ? DAY_NAMES[l.weekdays[0]]
            : l.weekdays.map((d) => DAY_SHORT[d]).join(", ")
        }`;
  const zone = zoneOf(l);
  const label = zoneLabel(zone, now);
  const suffix = isOtherZone(l) ? ` ${label === "Z" ? "UTC" : label}` : "";
  if (l.all_day) {
    // "Wednesdays all day UTC"; every day, the zone doesn't matter.
    return l.schedule_kind === "weekly" && l.weekdays.length === 7 ? "Every day, all day" : `${days} all day${suffix}`;
  }
  const time = l.end_time ? `${l.start_time}–${l.end_time}` : l.start_time;
  const text = `${days} ${time}${suffix}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A date as "YYYY-MM-DD", local. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * A meeting's time on its line (NETL-045): here, "19:00–19:30"; and when the
 * listing's zone isn't this computer's, its own time after: "20:00–21:00 ·
 * 01:00Z". With no meeting in reach, its written times.
 */
export function meetingTimes(l: Schedule, m: Meeting | null): string {
  if (l.all_day) return "All day"; // NETL-028
  if (!m) {
    const written = l.end_time ? `${l.start_time}–${l.end_time}` : l.start_time;
    if (!isOtherZone(l)) return written;
    const label = zoneLabel(zoneOf(l), new Date());
    return label === "Z" ? `${written}Z` : `${written} ${label}`;
  }
  const here = l.end_time ? `${hhmm(m.start)}–${hhmm(m.end)}` : hhmm(m.start);
  return isOtherZone(l) ? `${here} · ${timeIn(m.start, zoneOf(l))}` : here;
}

/**
 * When a meeting is, here and in UTC, so both are at hand (NETL-045):
 * "Tue Nov 17, 20:00 EST · Wed 01:00Z".
 */
export function describeMeeting(m: Meeting): string {
  const here = `${DAY_SHORT[m.start.getDay()]} ${MONTH_SHORT[m.start.getMonth()]} ${m.start.getDate()}, ${timeIn(m.start, localZone())}`;
  if (localZone() === "UTC") return here;
  const utc = wallTime(m.start, "UTC");
  return `${here} · ${DAY_SHORT[utc.weekday]} ${timeIn(m.start, "UTC")}`;
}

/**
 * When an all-day net's day runs here, when its zone isn't this computer's
 * and it doesn't meet every day: "Tue 20:00 – Wed 20:00 here" (NETL-028).
 * Otherwise "".
 */
export function allDayHere(l: Schedule, m: Meeting | null): string {
  if (!l.all_day || !m || !isOtherZone(l) || (l.schedule_kind === "weekly" && l.weekdays.length === 7)) return "";
  const at = (d: Date) => `${DAY_SHORT[d.getDay()]} ${hhmm(d)}`;
  return `${at(m.start)} – ${at(m.end)} here`;
}

/** A whole listing's schedule, each session's in turn: "Tuesdays 19:00; Thursdays 20:00" (NETL-021). */
export function describeListing(l: NetListing, now: Date = new Date()): string {
  return linesOf(l)
    .map((s) => describeSchedule(s, now))
    .join("; ");
}
