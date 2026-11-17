import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import type { NetListing, NetListingDetails, NetSession, Operator, Repeater } from "../../types";
import { haversineKm } from "../../geo";
import { formatRepeater, tuningDetails } from "../../repeaters";
import {
  allDayHere,
  comingUp,
  dailyDays,
  describeMeeting,
  describeListing,
  describeSchedule,
  isoDate,
  linesOf,
  meetingTimes,
  monthlyWeeks,
  nextMeeting,
  seasonMark,
  seasonNote,
  startsIn,
  weekView,
  zuluAfter,
  type Meeting,
  type NetLine,
  type WeekEntry,
} from "../../netSchedule";
import { localZone, zoneName } from "../../timeZones";
import { pad2 } from "../../utils";
import NetListingForm, { EMPTY_LISTING } from "../nets/NetListingForm";
import type { ActivityPrefill } from "../operations/activityPrefill";
import { shortMiles } from "../checkins/roster/shared";
import { CalendarClock, ChevronDown, ChevronRight, Info, Play } from "lucide-react";
import ActivityTypeIcon from "../ActivityTypeIcon";
import { useMinuteClock } from "../../hooks/useMinuteClock";
import { bandOf, mhzFromText } from "../../bands";
import BandChip from "../BandChip";
import ShareListControls from "../ShareListControls";

interface Props {
  operators: Operator[];
  /** The current operator: their location gives each repeater's distance, and they're recorded on changes. */
  selectedOperatorId: string | null;
  /** Opens the create-activity form filled from a listing (NETL-030). */
  onStartActivity: (prefill: ActivityPrefill) => void;
}

const FOLDS_KEY = "roc-net-folds";

/** The sections of the week folded (true) or opened (false) on this computer; others use their default. */
function loadFolds(): Record<string, boolean> {
  try {
    const v = localStorage.getItem(FOLDS_KEY);
    return v ? (JSON.parse(v) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveFolds(folds: Record<string, boolean>) {
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(folds));
  } catch {
    // Still applies for this session.
  }
}

/** A listing's details, for the form. */
function detailsOf(l: NetListing): NetListingDetails {
  const { id: _id, retired_at: _retired, ...details } = l;
  return details;
}

/**
 * A reference of the nets in the area — when each meets, how to tune in,
 * and how to check in — with the option to start an activity from one
 * (net-listings.md).
 */
export default function NetsTab({ operators, selectedOperatorId, onStartActivity }: Props) {
  const [listings, setListings] = useState<NetListing[]>([]);
  const [retired, setRetired] = useState<NetListing[]>([]);
  const [repeaters, setRepeaters] = useState<Repeater[]>([]);
  // null: not editing; "new": adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [repeaterFilter, setRepeaterFilter] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  // The listing whose Delete is waiting to be confirmed (NETL-012).
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rows with their details open, by day and net.
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const now = useMinuteClock();
  // Sections folded or opened on this computer (NETL-027); today's and those
  // while searching are kept for the moment only, not saved.
  const [folds, setFolds] = useState<Record<string, boolean>>(loadFolds);
  const [momentFolds, setMomentFolds] = useState<{ context: string; folds: Record<string, boolean> }>({
    context: "",
    folds: {},
  });

  function toggleRow(key: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const refresh = useCallback(() => {
    api.listNetListings().then(setListings).catch(() => setListings([]));
    api.listNetListings(true).then(setRetired).catch(() => setRetired([]));
    // Retired repeaters too: a listing keeps one it already names (NETL-002).
    Promise.all([api.listRepeaters(), api.listRepeaters(true)])
      .then(([inUse, old]) => setRepeaters([...inUse, ...old]))
      .catch(() => setRepeaters([]));
  }, []);
  useEffect(refresh, [refresh]);

  const repeaterById = useMemo(() => new Map(repeaters.map((r) => [r.id, r])), [repeaters]);
  const inUseRepeaters = repeaters.filter((r) => !r.retired_at);
  const operator = operators.find((o) => o.id === selectedOperatorId);
  const here =
    operator?.location_lat != null && operator.location_lon != null
      ? { lat: operator.location_lat, lon: operator.location_lon }
      : null;

  /** Whether any of the listing's sessions meets on the repeater. */
  const onRepeater = (l: NetListing, id: string) => l.sessions.some((s) => s.repeater_id === id);
  const repeaterOf = (s: NetSession) => (s.repeater_id ? repeaterById.get(s.repeater_id) : undefined);

  // A listing matches on any of its sessions' repeater or frequency (NETL-022).
  const query = search.trim().toLowerCase();
  const matching = listings.filter((l) => {
    if (repeaterFilter && !l.sessions.some((s) => s.repeater_id === repeaterFilter)) return false;
    if (!query) return true;
    const where = l.sessions.map((s) => {
      const r = repeaterOf(s);
      return `${s.frequency} ${r ? `${r.name} ${formatRepeater(r)}` : ""}`;
    });
    return [l.name, l.run_by, ...where].some((v) => v.toLowerCase().includes(query));
  });
  const week = weekView(matching, now);
  const filtering = query !== "" || repeaterFilter !== "";
  // Fold choices made while searching, or on today, last until the search or the day changes.
  const momentContext = filtering ? `search:${query}|${repeaterFilter}` : `day:${isoDate(now)}`;
  const moment = momentFolds.context === momentContext ? momentFolds.folds : {};

  /**
   * Whether a section is open (NETL-027): today and Daily open, other days
   * and As needed folded, unless chosen otherwise on this computer; every
   * section with a match open while searching.
   */
  function isOpen(key: string, today: boolean): boolean {
    const folded = moment[key] ?? (filtering ? false : today ? false : (folds[key] ?? key !== "daily"));
    return !folded;
  }

  function toggleSection(key: string, today: boolean) {
    const fold = isOpen(key, today);
    if (filtering || today) {
      setMomentFolds({ context: momentContext, folds: { ...moment, [key]: fold } });
    } else {
      setFolds((prev) => {
        const next = { ...prev, [key]: fold };
        saveFolds(next);
        return next;
      });
    }
  }
  // Nets on now or within 12 hours; the box is left out when there are none (NETL-025).
  const next = comingUp(matching, now);
  const editingListing = listings.find((l) => l.id === editing) ?? null;

  async function save(id: string | null, details: NetListingDetails) {
    await api.saveNetListing(id, details, selectedOperatorId);
    setEditing(null);
    refresh();
  }

  async function setRetiredState(l: { id: string }, retire: boolean) {
    setError(null);
    try {
      await api.setNetListingRetired(l.id, retire, selectedOperatorId);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(l: { id: string }) {
    setError(null);
    setDeleting(null);
    try {
      await api.deleteNetListing(l.id, selectedOperatorId);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  /** "Delete … for good?" under the net whose Delete was chosen (NETL-012). */
  function deleteConfirm(l: { id: string; name: string }, retired = false) {
    if (deleting !== l.id) return null;
    return (
      <div className="net-delete-confirm" role="group" aria-label={`Delete ${l.name}?`}>
        <span>
          Delete <strong>{l.name}</strong> for good? Activities started from it don't change.
          {!retired && " To only hide it, retire it instead."}
        </span>
        <div className="inline-form">
          <button className="danger" onClick={() => remove(l)}>
            Delete
          </button>
          <button onClick={() => setDeleting(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  /** Starts an activity from one session's meeting (NETL-030). */
  function start(l: NetLine, meeting: Meeting | null) {
    const r = repeaterOf(l);
    onStartActivity({
      title: l.name,
      activityType: l.activity_type,
      // The day and time here of the meeting it was started from; today when as needed (NETL-030).
      // All day: now when on today, else no time.
      date: isoDate(l.all_day && meeting?.underway ? now : (meeting?.start ?? now)),
      time: l.all_day
        ? meeting?.underway
          ? `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
          : ""
        : meeting
          ? `${pad2(meeting.start.getHours())}:${pad2(meeting.start.getMinutes())}`
          : l.start_time,
      frequency: r ? formatRepeater(r) : l.frequency,
      repeater:
        r && r.location_lat != null && r.location_lon != null
          ? { name: r.name, lat: r.location_lat, lon: r.location_lon }
          : null,
    });
  }

  // A listing being edited may name a retired repeater; keep it choosable.
  const formRepeaters = (l: NetListingDetails) =>
    inUseRepeaters.concat(repeaters.filter((r) => r.retired_at && l.sessions.some((s) => s.repeater_id === r.id)));

  /** The repeater and its frequency on one line ("W4ABC Orlando", "146.940 -0.600 PL 100.0"), or the typed frequency. */
  function tuneLine(l: NetSession) {
    const r = repeaterOf(l);
    return (
      <span className="net-row-where">
        <BandChip mhz={r ? r.output_mhz : mhzFromText(l.frequency)} keepSpace />
        {r && <span className="net-row-repeater">{r.name}{r.retired_at ? " (retired)" : ""}</span>}
        <span className="checkin-row-mono">{r ? formatRepeater(r) : l.frequency}</span>
      </span>
    );
  }

  function startButton(l: NetLine, meeting: Meeting | null) {
    return (
      <button
        className="icon-button"
        aria-label={`Start activity for ${l.name}`}
        title="Run this net: opens a new activity filled in from it"
        onClick={() => start(l, meeting)}
      >
        <Play />
      </button>
    );
  }

  /** Everything else about a net, under its row when ⓘ is clicked (NETL-021). */
  function details(l: NetLine) {
    const r = repeaterOf(l);
    const km =
      here && r?.location_lat != null && r.location_lon != null
        ? haversineKm(here.lat, here.lon, r.location_lat, r.location_lon)
        : null;
    const next = nextMeeting(l, now);
    // Every session's schedule when there are several, each with its frequency and season (NETL-008).
    const sessions = linesOf(l.listing);
    const meets =
      sessions.length === 1
        ? describeSchedule(l, now)
        : sessions
            .map((s) => {
              const sr = repeaterOf(s);
              const note = seasonNote(s, now);
              return `${describeSchedule(s, now)} on ${sr ? sr.name : s.frequency}${note ? ` (${note})` : ""}`;
            })
            .join("; ");
    const facts: [string, string][] = [
      ["Meets", meets],
      // Here and in UTC, so both are at hand (NETL-045).
      // All day: when its day runs here, if that differs (NETL-028).
      ["Next", l.all_day ? allDayHere(l, next) : next ? describeMeeting(next) : ""],
      ["Tune", r ? tuningDetails(r) : l.frequency],
      ["Repeater", r ? `${r.name}${km != null ? ` · ${shortMiles(km)} away` : ""}` : ""],
      ["Run by", l.run_by],
      ["Check-in", l.checkin_info],
      ["Notes", l.notes],
    ];
    return (
      <div className="net-row-details">
        <dl className="summary-list">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd className={k === "Tune" ? "checkin-row-mono" : undefined}>{v}</dd>
              </Fragment>
            ))}
        </dl>
        <span className="operator-row-actions">
          <button className="link-button" aria-label={`Edit ${l.name}`} onClick={() => setEditing(l.id)}>
            Edit
          </button>
          <button
            className="link-button danger-link"
            aria-label={`Retire ${l.name}`}
            title="Hide it from the list. Activities started from it don't change."
            onClick={() => setRetiredState(l, true)}
          >
            Retire
          </button>
          <button
            className="link-button danger-link"
            aria-label={`Delete ${l.name}`}
            title="Delete it for good. Activities started from it don't change."
            onClick={() => setDeleting(l.id)}
          >
            Delete
          </button>
        </span>
        {deleteConfirm({ id: l.id, name: l.name })}
      </div>
    );
  }

  /**
   * One net on one line: when, name, where to tune; ▶ to run it, ⓘ for the
   * rest. `underway` and `over` only ever mark today's lines.
   */
  function row(
    l: NetLine,
    meeting: Meeting | null,
    when: string,
    key: string,
    { underway = false, over = false } = {}
  ) {
    const open = openRows.has(key);
    const weeks = [monthlyWeeks(l) || dailyDays(l, now), seasonMark(l, now)].filter(Boolean).join(" · ");
    return (
      <div
        key={key}
        className={"net-row" + (underway ? " net-row-underway" : "") + (over ? " net-row-over" : "")}
      >
        <span className="net-row-when checkin-row-mono">{when}</span>
        <strong className="net-row-name">
          <ActivityTypeIcon type={l.activity_type} />
          {l.name}
          {weeks && <span className="net-row-weeks">{weeks}</span>}
        </strong>
        {tuneLine(l)}
        <span className="net-row-actions">
          {startButton(l, meeting)}
          <button
            className={"icon-button" + (open ? " active" : "")}
            aria-label={`${open ? "Hide" : "Show"} details of ${l.name}`}
            aria-expanded={open}
            title={open ? "Hide details" : "Details"}
            onClick={() => toggleRow(key)}
          >
            <Info />
          </button>
        </span>
        {open && details(l)}
      </div>
    );
  }

  /** Under way now, at today's meeting. */
  const isToday = (e: WeekEntry) =>
    !e.listing.all_day && e.meeting != null && e.meeting.underway && isoDate(e.meeting.start) === isoDate(now);

  /** The bands a section's nets need, once each, in the order first met: "2m, 70cm". */
  function bandsOf(nets: NetSession[]): string {
    const labels = nets.map((l) => {
      const r = repeaterOf(l);
      return bandOf(r ? r.output_mhz : mhzFromText(l.frequency))?.label;
    });
    return [...new Set(labels.filter((b): b is string => !!b))].join(", ");
  }

  /**
   * One section of the week under a heading that folds it (NETL-027); folded,
   * the heading still tells how many nets and on which bands.
   */
  function section(
    key: string,
    title: string,
    today: boolean,
    count: number,
    nets: NetSession[],
    rows: () => React.ReactNode
  ) {
    const open = isOpen(key, today);
    const Chevron = open ? ChevronDown : ChevronRight;
    const bands = bandsOf(nets);
    return (
      <section
        key={key}
        className={"net-day" + (today ? " net-day-today" : "") + (open ? "" : " net-day-folded")}
        aria-label={key === "daily" ? "Daily" : key === "asneeded" ? "As needed" : key}
        aria-current={today ? "date" : undefined}
      >
        <h4 className="net-day-heading">
          <button className="net-day-toggle" aria-expanded={open} onClick={() => toggleSection(key, today)}>
            <Chevron className="net-day-chevron" aria-hidden />
            {title}
            <span className="net-day-summary">
              {" · "}
              {count} {count === 1 ? "net" : "nets"}
              {!open && bands && ` · ${bands}`}
            </span>
          </button>
        </h4>
        {open && rows()}
      </section>
    );
  }


  return (
    <div className="panel nets-panel">
      <div className="panel-header-row">
        <h3>
          <CalendarClock className="heading-icon" />
          Nets
        </h3>
        <div className="checkin-roster-header-actions">
          {listings.length > 0 && (
            <input
              type="search"
              className="checkin-roster-search"
              aria-label="Search nets"
              placeholder="Search nets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {repeaters.some((r) => listings.some((l) => onRepeater(l, r.id))) && (
            <select aria-label="Show nets on" value={repeaterFilter} onChange={(e) => setRepeaterFilter(e.target.value)}>
              <option value="">All repeaters</option>
              {repeaters
                .filter((r) => listings.some((l) => onRepeater(l, r.id)))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          )}
          {editing !== "new" && (
            <button className="link-button" onClick={() => setEditing("new")}>
              + Add net
            </button>
          )}
        </div>
      </div>
      <p className="settings-hint">
        Times are shown in this computer's time, {zoneName(localZone())}, then in Zulu ("20:00 · 01:00Z").
        {!here && " Set a location on your operator to see how far each repeater is."}
      </p>
      {editing === "new" && (
        <NetListingForm
          initial={EMPTY_LISTING}
          repeaters={inUseRepeaters}
          onSave={(d) => save(null, d)}
          onCancel={() => setEditing(null)}
        />
      )}
      {editingListing && (
        // Once, above the schedule, even for a net listed under several days.
        <NetListingForm
          key={editingListing.id}
          initial={detailsOf(editingListing)}
          repeaters={formRepeaters(editingListing)}
          onSave={(d) => save(editingListing.id, d)}
          onCancel={() => setEditing(null)}
        />
      )}
      {next.length > 0 && (
        <section className="net-coming-up" aria-label="Coming up">
          <h4 className="net-day-heading">Coming up</h4>
          {next.map(({ listing: l, meeting }) => (
            <div key={l.key} className={"net-coming-row" + (meeting.underway ? " net-row-underway" : "")}>
              <span
                className={
                  "net-coming-when" +
                  (meeting.underway
                    ? " net-coming-now"
                    : meeting.start.getTime() - now.getTime() < 60 * 60_000
                      ? " net-coming-soon"
                      : "")
                }
              >
                {startsIn(meeting, now)}
                {/* Always followed by Zulu; beside "until 18:59", the end's (NETL-045). */}
                {zuluAfter(meeting.underway ? meeting.end : meeting.start)}
              </span>
              <strong className="net-row-name">
          <ActivityTypeIcon type={l.activity_type} />
          {l.name}
        </strong>
              {tuneLine(l)}
              <span className="net-row-actions">{startButton(l, meeting)}</span>
            </div>
          ))}
        </section>
      )}
      {listings.length === 0 && editing !== "new" && (
        <p className="checkin-empty-state">
          No nets listed yet. Add the nets in your area — which repeater, which days, when, and how
          to check in.
        </p>
      )}
      {listings.length > 0 && matching.length === 0 && (
        <p className="checkin-empty-state">No nets match.</p>
      )}
      {matching.length > 0 && (
        <div className="net-schedule">
          {/* Nets meeting most days, once, ahead of the week (NETL-020). */}
          {week.daily.length > 0 &&
            section("daily", "Daily", false, week.daily.length, week.daily.map((e) => e.listing), () =>
              week.daily.map((e) =>
                row(e.listing, e.meeting, meetingTimes(e.listing, e.meeting), `daily-${e.listing.key}`, {
                  underway: isToday(e),
                  over: e.overToday,
                })
              )
            )}
          {/* Sunday to Saturday, the same whatever day it is; days without nets are left out (NETL-020). */}
          {week.days
            .filter((day) => day.entries.length > 0)
            .map((day) =>
              section(
                day.name,
                day.name + (day.today ? " · Today" : ""),
                day.today,
                day.entries.length,
                day.entries.map((e) => e.listing),
                () =>
                  day.entries.map((e) =>
                    row(e.listing, e.meeting, meetingTimes(e.listing, e.meeting), `${day.name}-${e.listing.key}`, {
                      underway: day.today && isToday(e),
                      over: e.overToday,
                    })
                  )
              )
            )}
          {week.asNeeded.length > 0 &&
            section("asneeded", "As needed", false, week.asNeeded.length, week.asNeeded, () =>
              week.asNeeded.map((l) => row(l, null, "As needed", `asneeded-${l.key}`))
            )}
        </div>
      )}
      {error && <p className="weather-area-error">{error}</p>}
      {retired.length > 0 && (
        <>
          <button className="link-button" onClick={() => setShowRetired((v) => !v)}>
            {showRetired ? "Hide retired" : `Show retired (${retired.length})`}
          </button>
          {showRetired &&
            retired.map((l) => (
              <Fragment key={l.id}>
                <div className="operator-row">
                  <span className="settings-hint">
                    {l.name} — {describeListing(l)}
                  </span>
                  <span className="operator-row-actions">
                    <button
                      className="link-button"
                      aria-label={`Restore ${l.name}`}
                      onClick={() => setRetiredState(l, false)}
                    >
                      Restore
                    </button>
                    <button
                      className="link-button danger-link"
                      aria-label={`Delete ${l.name}`}
                      title="Delete for good. Activities started from it don't change."
                      onClick={() => setDeleting(l.id)}
                    >
                      Delete
                    </button>
                  </span>
                </div>
                {deleteConfirm({ id: l.id, name: l.name }, true)}
              </Fragment>
            ))}
        </>
      )}
      <ShareListControls kind="nets" selectedOperatorId={selectedOperatorId} onImported={refresh} />
    </div>
  );
}
