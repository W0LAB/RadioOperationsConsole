# Feature: Net Listings

## Status

Draft — implemented, except as listed under "Not yet built".

## Purpose

A reference of the nets an operator may want to join: when each meets, how
to get a radio on it, whether the repeater is in reach, and how to check in.
Operators otherwise keep this in a spreadsheet they have to open; in an
emergency the same list answers "which nets are running, and where." Net
listings keep it in the app, offline, next to the repeaters the nets meet
on.

Whoever runs a given net changes from week to week, so the app doesn't
record whose net it is. Any listing can be used to start an activity, for
whoever happens to be net control, but that is a convenience beside the
reference, not its purpose.

It is reference data, not a calendar: nothing reminds, notifies, or tracks
who attended.

Many nets don't meet in one place at one time. One group runs the same net
on 20m, 40m and 80m at different hours, or moves from 80m in winter to 40m
in summer. Such a net is one listing with several sessions, so the list
grows by a line per meeting, not by a whole listing per variant.

Nets also publish their times in different time zones: HF nets usually
in UTC (Zulu), local nets in local time. When daylight-saving time starts or
ends, the two shift an hour apart, and a UTC net can move to the previous
or next weekday here. So each listing keeps the time zone its times are
written in, and the app works out when each meeting falls here.

## Relationship to other documents

- Listings name a repeater from the directory
  ([repeater-directory.md](repeater-directory.md)).
- Starting an activity from a listing fills the create-activity form
  (`UX-OPS-006`) the way picking a repeater does (`RPT-020`–`021`).
- Opening and closing scripts (planned, a separate spec) will be held on the
  listing.
- Included in database backups ([database-backup-restore.md](database-backup-restore.md)).
- Can be exported and imported to share with other operators, as text
  without the link to a repeater ([shared-lists.md](shared-lists.md)).

## What a listing holds

- **NETL-001:** A listing MUST have a name ("Orange County ARES Net") and an
  activity type (`LIFE-050`), directed net by default.
- **NETL-002:** A listing MUST have one or more sessions. A session is one
  way the net meets, with its own frequency and schedule (`NETL-003`–`004`).
  A net on 20m, 40m and 80m at different hours, or on one frequency in the
  morning and another in the afternoon, is one listing with several
  sessions, not several listings. A session MAY name a repeater from the
  directory, or instead hold a frequency as free text for one that isn't a
  repeater (simplex, HF, "146.520 then 147.000"). A session follows its
  repeater: editing the repeater changes what the listing shows. A session
  on a retired repeater keeps it, marked as retired.
- **NETL-003:** Each session MUST have a schedule, one of:
  - **Weekly**, on one or more weekdays ("Tuesdays", "Monday–Friday").
  - **Monthly**, on a weekday in one or more weeks of the month ("2nd and 4th
    Thursday", "last Sunday").
  - **As needed**: no fixed time (an ARES activation net, a SKYWARN net).
- **NETL-004:** A weekly or monthly session MUST have a start time and MAY
  have an end time. These are clock times in the listing's time zone
  (`NETL-040`), and the weekdays and weeks of the month are counted in that
  zone too.
- **NETL-005:** A listing MAY hold who runs it (net manager or sponsoring
  group, as free text) and notes. Anything the schedule can't express
  ("not on holidays", "5th Thursday is a social net") goes in the notes.

- **NETL-006:** A listing MAY hold check-in instructions: what a station
  should know before checking in ("call sign and name, mobiles first,
  check-ins start at 19:05").
- **NETL-007:** The activity type used when starting an activity from the
  listing MUST be entered apart from the rest, as something only net control
  needs ("If you run this net"), and MUST NOT be shown in the list.
- **NETL-008:** A session MAY be marked as summer only or winter only. Write
  "3.588 MHz in winter, 7.110 MHz in summer" as two sessions. A meeting
  belongs to whichever season is in effect when it starts (`NETL-046`). A
  session out of season MUST NOT be listed in the week or in Coming up. In
  the listing's details it MUST be shown as out of season and say when it
  comes back ("Summer only · from Mar 14").
- **NETL-009:** A listing with one session MUST be entered and shown as
  simply as a listing was before sessions: the form shows one frequency and
  one schedule, and the word "session" appears only once a second session
  is added. The name, activity type, time zone, who runs it, check-in
  instructions and notes belong to the listing and are shared by all of its
  sessions. Retiring, restoring or deleting a listing does so for every
  session. A session MAY be removed from a listing that has another.


## Managing listings

- **NETL-010:** The operator MUST be able to add, edit, and retire listings.
  A retired listing is hidden but kept, and MAY be restored.
- **NETL-011:** Editing or retiring a listing MUST NOT change any activity
  started from it.
- **NETL-012:** A retired listing MAY be deleted for good, from the retired
  list (retiring first stands in for a confirmation). Activities started from
  it MUST NOT change, and the history MUST keep showing its name.

## Time zones

- **NETL-040:** A listing MUST have a time zone: the zone its sessions' days
  and times are written in. It is UTC (shown as "UTC (Zulu)"), this
  computer's zone, or any other named zone (an IANA name such as
  `America/Chicago`, offered by place name). A new listing MUST start in this
  computer's zone, with UTC one choice away. The zone MUST be stored by
  name, never as "this computer's", so a listing keeps its meaning after the
  computer's zone changes and on another computer (`SHARE-005`).
- **NETL-041:** Changing a listing's time zone MUST keep the days and times
  as written and change only the zone they are read in, because the change
  corrects a listing entered in the wrong zone. The form MUST say which zone
  the times are in, beside them ("Times are UTC").
- **NETL-042:** Each meeting MUST be worked out in the listing's zone (its
  date, weekday, week of the month, start and end) and then shown in this
  computer's zone. A UTC net MUST therefore move an hour on the local clock
  when local daylight-saving time starts or ends. A net in this computer's
  zone MUST NOT move.
- **NETL-043:** A meeting MUST be listed under the weekday it falls on here,
  not the weekday it is written on: 01:00Z Wednesday is listed under
  Tuesday in the US. A net whose local weekday changes when daylight-saving
  time starts or ends MUST move with it.
- **NETL-044:** If a time doesn't exist in the listing's zone on a day
  (skipped when daylight-saving time starts), the meeting MUST be moved
  later by the length of the gap (02:30 becomes 03:30). If a time happens
  twice (repeated when daylight-saving time ends), the meeting MUST be the
  first of the two. In both cases the net MUST still be listed that day.
- **NETL-045:** Wherever a meeting's time is shown (the week, Coming up,
  Start activity), it MUST be in local time. When the listing's zone isn't
  this computer's, the time in the listing's own zone MUST follow, with the
  zone shown: "20:00 · 01:00Z", "18:00 · 19:00 EST". In the details, each
  session's schedule MUST be in the listing's own zone ("Wednesdays
  01:00–02:00 UTC"), followed by its next meeting in local time and in UTC
  ("Next: Tue Nov 17, 20:00 EST · Wed 01:00Z"), so both are always at hand.
- **NETL-046:** Summer (`NETL-008`) is the period when the listing's zone
  keeps daylight-saving time. For a listing in UTC, or in another zone that
  doesn't keep daylight-saving time, summer follows this computer's zone
  instead. If neither zone keeps daylight-saving time, both seasons'
  sessions MUST be listed, each marked "summer" or "winter".
- **NETL-047:** When the app is upgraded, listings made before time zones
  existed MUST take this computer's zone by name, so none of them moves.
  Nothing in such a listing says what zone its times were written in, so
  none is guessed. One that was written in another zone, such as Zulu, is
  corrected in its form (`NETL-041`).

## Seeing what's on

- **NETL-019:** Listings MUST have their own "Nets" tab, placed just before
  Settings so the keyboard shortcuts of the tabs used while running a net
  don't change. The tab MUST work the same whatever activity is focused,
  or none.
- **NETL-020:** Listings MUST be shown as a fixed week, Sunday to Saturday,
  that looks the same whatever day it is: one heading per weekday by name
  ("Thursday"), a weekday with no nets left out, each weekday's nets in
  start-time order. Each line is one session's meeting. The weekday and
  order are those of the meeting here (`NETL-043`), so a listing with
  several sessions can have several lines under one day. A weekly session
  that meets on five weekdays or more MUST instead be listed once, under a
  **Daily** heading ahead of the week, with its days after its name, as
  they fall here ("Mon–Fri"; nothing when every
  day), so each weekday shows the nets that set it apart. A session on
  fewer weekdays MUST be listed under each, and a monthly session under its
  weekday with which weeks it meets ("2nd & 4th"). Today's heading MUST be
  marked; its nets, and the
  daily nets meeting today, MUST stay listed, one under way marked and one
  already over dimmed. "As needed" nets come last, by name.
- **NETL-027:** Each heading of the week (Daily, the weekdays, As needed)
  MUST fold and unfold its nets, and say how many it holds ("Tuesday · 6
  nets"); folded, also which bands they need ("· 2m, 70cm, 40m"). Today and
  Daily MUST start open, the other weekdays and As needed folded. A heading
  opened or folded MUST stay so on this computer, except today's, which
  opens again each day. While searching or filtered, every heading with a
  match MUST be open. A heading's net count is of its lines ("Daily · 12
  nets").
- **NETL-021:** Each meeting MUST take one line: its time (`NETL-045`), its
  name, and its session's repeater with the repeater's one-line frequency
  ("W4ABC Orlando 146.940 -0.600 PL 100.0"), or the session's own frequency
  text; then ▶ (Start activity, `NETL-030`) and ⓘ. ⓘ MUST open the rest
  under the line: its schedule (every session's, in season or out:
  `NETL-008`, `NETL-045`), how to tune in (the repeater's output
  and input frequency, offset, tone, and mode: "Output 146.940 · Input
  146.340 (-0.600) · Tone PL 100.0 · FM"), the repeater and its distance
  (`NETL-024`), who runs it, its check-in instructions, its notes, and Edit
  and Retire.
- **NETL-024:** When the current operator has a location and the listing's
  repeater has one, the listing MUST show how far the repeater is ("14.2 mi
  away"), as a guide to whether it's in reach, in its details (`NETL-021`).
- **NETL-025:** Above the week, a **Coming up** box MUST list the sessions
  on now or starting within 12 hours, each once at its next meeting, soonest
  first, with times as in `NETL-045`: "On now · until 08:00" in green for
  one under way, else "in 25 min" or "in 2 h 10 min" — each with ▶. A
  net starting within the hour MUST show its time in amber (still to do).
  With no such nets the box is left out.
- **NETL-026:** Each line MUST show, at a glance, which radio it needs and
  what kind of net it is: a band chip before the repeater, worked out from
  the frequency ("2m", "70cm", "10m", "GMRS", "MURS", "CB"), colored by group
  (HF, VHF, UHF, personal radio services) in colors clear of the app's
  amber, red, and green; and an icon for the net's type before its name
  (SKYWARN in the storm color). Today's heading MUST be in the accent color.
  The same band and type marks MUST be used elsewhere: the band before each
  repeater's frequency in the Repeaters list (as colored text, leaving the
  names room), the band and type icon on each activity in the Activities
  panel (`UX-OPS-015`) and an event's activities, with *open* in green and
  *not started* in amber.
  The top bar keeps neither, having no room to spare.
- **NETL-022:** The list MUST be searchable by name, repeater, frequency,
  and who runs it, and MAY be filtered to one repeater. Searching for any one
  session's repeater or frequency finds the listing. A repeater in the
  directory MUST show how many listings meet on it, through any of their
  sessions.
- **NETL-023:** The list MUST work entirely offline. The next meeting is
  worked out from the schedule; nothing is fetched or stored per occurrence.
  Time zone rules MUST come with the app, not from the network.

## Starting a net from a listing

- **NETL-030:** Every meeting line MUST offer "Start activity" (▶) as a
  secondary action, which opens the create-activity form filled with the
  listing's name as the title, its type, and that line's session: its
  frequency (the repeater's one-line form, or its frequency text), its
  repeater, and its start time in local time (`NETL-042`). The date is the
  local date of the meeting started from in the list, or today for "as
  needed".
- **NETL-031:** Starting from a listing MUST NOT create anything by itself;
  the operator confirms with Create and MAY change any value first.
- **NETL-032:** The activity MUST NOT keep a link back to the listing; it
  keeps its own copies, like a repeater's (`RPT-021`).

## Not in scope

- Reminders, notifications, or alarms of any kind.
- Recording which nets were attended or run.
- Cancellations or one-off changes to a single meeting. If a net doesn't
  meet one week, the list still shows it.
- Schedules beyond weekly, monthly-by-week, and as needed (every other
  week, "unless it's a holiday"); those go in the notes.
- Seasons other than summer and winter, or seasons that change on fixed
  dates. Those go in the notes.
- Choosing per session which time zone to use. A listing has one zone.
- Setting the time zone of several listings at once. Each is corrected in
  its own form (`NETL-041`).
- Calendar export (iCalendar).

## Not yet built

- Importing listings from a spreadsheet (CSV). Held back because people's
  spreadsheets won't share one layout; it needs either a fixed template to
  fill in or a column-matching step, decided when it's built.
- Printing or exporting the list.
- Sessions (`NETL-002`, `NETL-008`, `NETL-009`) and time zones
  (`NETL-040`–`048`). Until they're built, a listing has one frequency and
  one schedule, and its times are read in this computer's zone.

## Acceptance examples

- Given a listing "Tuesday Night Net" on W4ABC Orlando, weekly on Tuesday,
  19:00–19:30
  When it is Tuesday 19:10
  Then it is listed under "Today", marked as on now
  And it shows "Output 146.940 · Input 146.340 (-0.600) · Tone PL 100.0 · FM"
  And how far W4ABC Orlando is from the operator.

- Given a listing "Morning Net", Monday to Friday at 07:00
  Then it is listed once, under Daily, as "Morning Net Mon–Fri"
  And not under any weekday
  And on a weekday after 07:30 it is dimmed as over.

- Given it is Friday and Tuesday holds 6 nets on 2m and 70cm
  Then Tuesday's heading is folded, reading "Tuesday · 6 nets · 2m, 70cm"
  And once the operator opens it, it stays open the next time.

- Given a listing "County ARES Net", monthly on the 2nd and 4th Thursday at
  20:00, and today is Friday, October 2, 2026
  Then it is listed under "Thu Oct 8" (the 2nd Thursday)
  And its next meeting after that is October 22 (the 4th), not October 29
  (a 5th Thursday).

- Given the listing "Tuesday Night Net"
  When the operator chooses Start activity under Tuesday's heading
  Then the create-activity form shows the title "Tuesday Night Net", directed
  net, that Tuesday's date, 19:00, `146.940 -0.600 PL 100.0`, and the repeater
  W4ABC Orlando
  And nothing is created until the operator chooses Create.

- Given W4ABC Orlando's tone is changed to PL 103.5 in the directory
  Then the listing shows PL 103.5
  And activities started from it earlier still show PL 100.0.

- Given a listing "GhostNet North America" in UTC, weekly on Wednesday at
  01:00, on a computer in `America/New_York`
  Then in the week of Tuesday, October 27, 2026 it is listed under Tuesday
  as "21:00 · 01:00Z"
  And from November 1, 2026, when daylight-saving time ends, under Tuesday
  as "20:00 · 01:00Z"
  And its details read "Wednesdays 01:00 UTC" and "Next: Tue Nov 17, 20:00
  EST · Wed 01:00Z" on November 16.

- Given a listing in UTC, weekly on Wednesday at 04:30, on a computer in
  `America/New_York`
  Then on October 28, 2026 it is listed under Wednesday at 00:30
  And from November 1, 2026 under Tuesday at 23:30.

- Given "Tuesday Night Net" in `America/New_York`, Tuesdays at 19:00
  Then it is listed at "19:00" before and after November 1, 2026, with no
  second time on the line
  And its details on November 16 read "Next: Tue Nov 17, 19:00 EST · Wed
  00:00Z".

- Given a listing in `America/New_York`, Sundays at 02:30
  Then on March 14, 2027 it is listed at 03:30
  And given another, Sundays at 01:30, on November 7, 2027 it starts at
  01:30 EDT (05:30Z), not 01:30 EST.

- Given "AHRN Persistent Presence" in UTC with four daily sessions: 14.115
  at 20:00, 7.115 at 13:00, 7.115 at 23:00 and 3.564 at 03:00
  Then Daily lists four lines with that name, each with its own band chip
  and local time
  And its details list all four sessions
  And changing who runs it, or retiring it, applies to all four.

- Given "[AFMARS] 4TX1" in UTC, daily at 20:00, with a summer-only session
  on 4.875 USB and a winter-only session on 3.299 USB, on a computer in
  `America/New_York`
  Then on November 16, 2026 only the 3.299 session is listed
  And its details show the 4.875 session as "Summer only · from Mar 14".

- Given "GhostNet North America" set to Wednesday 01:00 in
  `America/New_York` by the upgrade (`NETL-047`)
  When the operator changes its time zone to UTC
  Then the form still reads Wednesday 01:00
  And it is listed under Tuesday at 20:00 (EST).

- Given a net list exported on a computer in `America/New_York`, holding
  "GhostNet North America" in UTC at Wednesday 01:00 and "Tuesday Night
  Net" in `America/New_York` at Tuesday 19:00
  When it is imported on a computer in `America/Chicago` in November
  Then the first is listed under Tuesday as "19:00 · 01:00Z"
  And the second under Tuesday as "18:00 · 19:00 EST".
