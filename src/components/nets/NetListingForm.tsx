import { useState } from "react";
import type { NetListingDetails, NetSession, Repeater, ScheduleKind, Season } from "../../types";
import { formatRepeater } from "../../repeaters";
import { describeMeeting, describeSchedule, nextMeeting, WEEK_OPTIONS, WEEKDAY_OPTIONS } from "../../netSchedule";
import ActivityTypeSelect from "../operations/ActivityTypeSelect";
import TimeZoneChoice, { zoneHint } from "./TimeZoneChoice";
import { localZone } from "../../timeZones";
import { ChevronDown, ChevronRight } from "lucide-react";

export const EMPTY_SESSION: NetSession = {
  repeater_id: null,
  frequency: "",
  schedule_kind: "weekly",
  weekdays: [],
  weeks: [],
  all_day: false,
  start_time: "",
  end_time: "",
  season: "",
};

export const EMPTY_LISTING: NetListingDetails = {
  name: "",
  activity_type: "directed_net",
  run_by: "",
  checkin_info: "",
  notes: "",
  // This computer's, filled in when the form opens (NETL-040).
  time_zone: "",
  sessions: [EMPTY_SESSION],
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Why a session can't be saved yet, or null (NETL-002–004). The backend checks the same. */
function sessionProblem(s: NetSession): string | null {
  if (s.schedule_kind === "as_needed") return null;
  if (s.weekdays.length === 0) return "Choose the day or days the net meets.";
  if (s.schedule_kind === "monthly" && s.weeks.length === 0) return "Choose which weeks of the month it meets.";
  if (s.all_day) return null;
  if (!TIME.test(s.start_time.trim())) return "Enter the start time as HH:MM, for example 19:00.";
  if (s.end_time.trim()) {
    if (!TIME.test(s.end_time.trim())) return "Enter the end time as HH:MM, or leave it blank.";
    // An end before the start is the next day: 22:00–01:00 runs overnight (NETL-004).
    if (s.end_time.trim() === s.start_time.trim()) return "The end time should differ from the start time.";
  }
  return null;
}

/** "1st", "2nd", "3rd", "4th"… */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/**
 * How the form names a session when there are several: "2nd schedule". The
 * word "session" is never shown (NETL-009); on screen they are "Meets" and
 * "Also meets".
 */
export function scheduleName(index: number): string {
  return `${ordinal(index + 1)} schedule`;
}

/**
 * Why the listing can't be saved yet, or null (NETL-001–004). With several
 * sessions, says which ("2nd schedule: …"). The backend checks the same.
 */
export function listingProblem(d: NetListingDetails): string | null {
  if (!d.name.trim()) return "Give the net a name.";
  for (const [i, s] of d.sessions.entries()) {
    const problem = sessionProblem(s);
    if (problem) return d.sessions.length > 1 ? `${scheduleName(i)}: ${problem}` : problem;
  }
  return null;
}

/** Toggles a value in a list, keeping it sorted the way `order` lists them. */
function toggle<T>(list: T[], value: T, order: T[]): T[] {
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return order.filter((v) => next.includes(v));
}

/** A session as saved: an all-day one has no times (NETL-004). */
function tidy(s: NetSession): NetSession {
  return s.all_day
    ? { ...s, start_time: "", end_time: "" }
    : { ...s, start_time: s.start_time.trim(), end_time: s.end_time.trim() };
}

/**
 * One session's frequency and schedule (NETL-002–004). With several, the
 * first is headed "Meets" and the rest "Also meets"; each may be summer or
 * winter only (NETL-008) or removed.
 */
function SessionFields({
  s,
  index,
  count,
  zone,
  repeaters,
  onChange,
  onRemove,
  enter,
  zoneChoice,
}: {
  s: NetSession;
  index: number;
  count: number;
  zone: string;
  repeaters: Repeater[];
  onChange: (patch: Partial<NetSession>) => void;
  onRemove: () => void;
  enter: (e: React.KeyboardEvent) => void;
  /** The listing's time zone choice, shown beside the times when there is one session (NETL-040). */
  zoneChoice?: React.ReactNode;
}) {
  const several = count > 1;
  // "Start time" alone with one session; "Start time (2nd schedule)" with several.
  const label = (text: string) => (several ? `${text} (${scheduleName(index)})` : text);
  const scheduled = s.schedule_kind !== "as_needed";
  // Once the times are complete, when that is here and in Zulu (NETL-045).
  const next = scheduled && !s.all_day && !sessionProblem(s) ? nextMeeting({ ...s, time_zone: zone }, new Date()) : null;
  const fields = (
    <div className="net-form-grid">
      <span className="net-form-label">Frequency</span>
      <div className="inline-form">
        <select
          aria-label={label("Repeater")}
          value={s.repeater_id ?? ""}
          onChange={(e) => onChange({ repeater_id: e.target.value || null })}
        >
          <option value="">Not in the directory</option>
          {repeaters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} — {formatRepeater(r)}
              {r.retired_at ? " (retired)" : ""}
            </option>
          ))}
        </select>
        {!s.repeater_id && (
          <input
            aria-label={label("Frequency")}
            placeholder="e.g. 146.520 or 3.940 LSB"
            value={s.frequency}
            onChange={(e) => onChange({ frequency: e.target.value })}
            onKeyDown={enter}
          />
        )}
      </div>

      <span className="net-form-label">Days</span>
      <div className="inline-form">
        <select
          aria-label={label("Schedule")}
          value={s.schedule_kind}
          onChange={(e) => onChange({ schedule_kind: e.target.value as ScheduleKind })}
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="as_needed">As needed</option>
        </select>
        {scheduled && (
          <div className="net-choices" role="group" aria-label={label("Days")}>
            {WEEKDAY_OPTIONS.map((w) => (
              <button
                key={w.value}
                type="button"
                aria-pressed={s.weekdays.includes(w.value)}
                className={s.weekdays.includes(w.value) ? "range-kind-chosen" : undefined}
                onClick={() =>
                  onChange({ weekdays: toggle(s.weekdays, w.value, WEEKDAY_OPTIONS.map((o) => o.value)) })
                }
              >
                {w.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {s.schedule_kind === "monthly" && (
        <>
          <span className="net-form-label">Weeks</span>
          <div className="net-choices" role="group" aria-label={label("Weeks of the month")}>
            {WEEK_OPTIONS.map((w) => (
              <button
                key={w.value}
                type="button"
                aria-pressed={s.weeks.includes(w.value)}
                className={s.weeks.includes(w.value) ? "range-kind-chosen" : undefined}
                onClick={() => onChange({ weeks: toggle(s.weeks, w.value, WEEK_OPTIONS.map((o) => o.value)) })}
              >
                {w.label}
              </button>
            ))}
          </div>
        </>
      )}

      {scheduled && (
        <>
          <span className="net-form-label">Time</span>
          <div className="inline-form">
            {!s.all_day && (
              <>
                <input
                  aria-label={label("Start time")}
                  className="repeater-mhz"
                  placeholder="19:00"
                  value={s.start_time}
                  onChange={(e) => onChange({ start_time: e.target.value })}
                  onKeyDown={enter}
                />
                <span aria-hidden="true">–</span>
                <input
                  aria-label={label("End time")}
                  className="repeater-mhz"
                  placeholder="end"
                  title="End time, optional"
                  value={s.end_time}
                  onChange={(e) => onChange({ end_time: e.target.value })}
                  onKeyDown={enter}
                />
              </>
            )}
            <label className="checkbox-row" title="On the air around the clock, the whole of each day it meets">
              <input
                type="checkbox"
                aria-label={label("All day")}
                checked={s.all_day}
                onChange={(e) => onChange({ all_day: e.target.checked })}
              />
              All day
            </label>
            {/* With one session the zone choice itself is here; with several it is above them all (NETL-041). */}
            {zoneChoice ?? (several && <span className="settings-hint">{zoneHint(zone)}</span>)}
          </div>
          {next && (
            <>
              <span className="net-form-label">Next</span>
              {/* The times as entered, converted: local, then Zulu (NETL-045). */}
              <span className="settings-hint" aria-label={label("Next meeting")}>
                {describeMeeting(next)}
              </span>
            </>
          )}
        </>
      )}

      {several && (
        <>
          <span className="net-form-label">Season</span>
          <div className="inline-form">
            <select
              aria-label={label("Season")}
              value={s.season}
              title="Summer is while daylight-saving time is kept"
              onChange={(e) => onChange({ season: e.target.value as Season })}
            >
              <option value="">All year</option>
              <option value="summer">Summer only</option>
              <option value="winter">Winter only</option>
            </select>
            <button
              type="button"
              className="link-button danger-link"
              aria-label={`Remove ${scheduleName(index)}`}
              onClick={onRemove}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
  // One session looks as a listing always has; the headings only appear with a second (NETL-009).
  return several ? (
    <fieldset className="net-run-section net-session" aria-label={scheduleName(index)}>
      <legend>{index === 0 ? "Meets" : "Also meets"}</legend>
      {fields}
    </fieldset>
  ) : (
    fields
  );
}

/** Adding or editing a net listing and its sessions. */
export default function NetListingForm({
  initial,
  repeaters,
  onSave,
  onCancel,
}: {
  initial: NetListingDetails;
  /** Repeaters to choose from (a retired one already on the listing is included). */
  repeaters: Repeater[];
  onSave: (d: NetListingDetails) => Promise<void>;
  onCancel: () => void;
}) {
  // A new listing starts on Local (NETL-040).
  const [d, setD] = useState<NetListingDetails>({ ...initial, time_zone: initial.time_zone || localZone() });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<NetListingDetails>) => setD((prev) => ({ ...prev, ...patch }));
  const setSession = (i: number, patch: Partial<NetSession>) =>
    setD((prev) => ({ ...prev, sessions: prev.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const scheduled = d.sessions.some((s) => s.schedule_kind !== "as_needed");
  const several = d.sessions.length > 1;
  // One zone for the whole listing (NETL-040): under the times with one session;
  // with several, once ahead of them all, each session still saying its zone.
  const zoneChoice = scheduled && <TimeZoneChoice value={d.time_zone} onChange={(time_zone) => set({ time_zone })} />;
  // Optional fields start folded away on a new net, open when editing one that has any.
  const [moreOpen, setMoreOpen] = useState(
    Boolean(initial.run_by || initial.checkin_info || initial.notes || initial.activity_type !== EMPTY_LISTING.activity_type)
  );

  async function save() {
    const problem = listingProblem(d);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await onSave({ ...d, sessions: d.sessions.map(tidy) });
    } catch (e) {
      setError(String(e));
    }
  }

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") onCancel();
  };
  const problem = listingProblem(d);

  return (
    <div className="repeater-form net-form">
      <div className="net-form-grid">
        <span className="net-form-label">Net name</span>
        <input
          autoFocus
          aria-label="Net name"
          placeholder="e.g. Tuesday Night Net"
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
          onKeyDown={enter}
        />
      </div>

      <section className="net-form-section" aria-label="When and where">
        <h4 className="net-form-heading">When and where</h4>
        {several && zoneChoice}
        {d.sessions.map((s, i) => (
          <SessionFields
            key={i}
            s={s}
            index={i}
            count={d.sessions.length}
            zone={d.time_zone}
            repeaters={repeaters}
            onChange={(patch) => setSession(i, patch)}
            onRemove={() => set({ sessions: d.sessions.filter((_, j) => j !== i) })}
            enter={enter}
            zoneChoice={several ? undefined : zoneChoice || undefined}
          />
        ))}
        <button
          type="button"
          className="link-button net-form-add"
          title="Another frequency, band, day or time this net meets on (NETL-002)"
          // A new session starts like the last, to change only what differs.
          onClick={() => set({ sessions: [...d.sessions, { ...d.sessions[d.sessions.length - 1], season: "" }] })}
        >
          + Also meets on another frequency or day
        </button>
      </section>

      <section className="net-form-section" aria-label="More details">
        <h4 className="net-form-heading">
          <button
            type="button"
            className="net-form-more"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            {moreOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            More details
          </button>
          {!moreOpen && <span className="net-form-heading-hint">Run by, check-in, notes, activity type</span>}
        </h4>
        {moreOpen && (
          <div className="net-form-grid">
            <span className="net-form-label">Run by</span>
            <input
              aria-label="Run by"
              placeholder="Net manager or group"
              value={d.run_by}
              onChange={(e) => set({ run_by: e.target.value })}
              onKeyDown={enter}
            />
            <span className="net-form-label">Check-in</span>
            <input
              aria-label="Check-in instructions"
              placeholder="e.g. call sign and name, mobiles first"
              value={d.checkin_info}
              onChange={(e) => set({ checkin_info: e.target.value })}
              onKeyDown={enter}
            />
            <span className="net-form-label">Notes</span>
            <input
              aria-label="Notes"
              placeholder="e.g. not on holidays"
              value={d.notes}
              onChange={(e) => set({ notes: e.target.value })}
              onKeyDown={enter}
            />
            <span className="net-form-label">Activity type</span>
            <div className="inline-form">
              <ActivityTypeSelect value={d.activity_type} onChange={(activity_type) => set({ activity_type })} />
              <span className="settings-hint">Used when you start an activity from this net.</span>
            </div>
          </div>
        )}
      </section>

      {error && <p className="weather-area-error">{error}</p>}
      <div className="net-form-footer">
        <span className="settings-hint">
          {!problem && (
            <>
              Meets:{" "}
              <strong>{d.sessions.map((s) => describeSchedule({ ...s, time_zone: d.time_zone })).join("; ")}</strong>
            </>
          )}
        </span>
        <div className="inline-form">
          <button onClick={save}>Save net</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
