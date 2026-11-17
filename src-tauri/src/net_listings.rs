//! Net listings (docs/features/net-listings.md): the nets in the area — which
//! repeater, which days, what time, who runs it. Reference data only: when a
//! net next meets is worked out from its schedule in the interface, and
//! nothing is stored per meeting.

use crate::repo::Repository;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A listing as stored and listed.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct NetListing {
    pub id: String,
    #[serde(flatten)]
    pub details: NetListingDetails,
    /// When it was retired, or empty while in use.
    pub retired_at: String,
}

/// What the operator enters for a listing: what all its sessions share
/// (NETL-009), and the sessions.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct NetListingDetails {
    pub name: String,
    pub activity_type: String,
    pub run_by: String,
    /// What to know before checking in (NETL-006).
    pub checkin_info: String,
    pub notes: String,
    /// The zone the sessions' days and times are written in, by IANA name:
    /// "UTC", "America/New_York" (NETL-040). Empty only from an older list
    /// file, until it is filled in with this computer's.
    #[serde(default)]
    pub time_zone: String,
    /// One or more, in order (NETL-002).
    pub sessions: Vec<NetSession>,
}

/// One way a net meets: its frequency and schedule (NETL-002–004, NETL-008).
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct NetSession {
    /// A repeater from the directory, or None for free-text frequency.
    pub repeater_id: Option<String>,
    pub frequency: String,
    /// "weekly", "monthly" or "as_needed".
    pub schedule_kind: String,
    /// 0 = Sunday … 6 = Saturday.
    pub weekdays: Vec<u8>,
    /// Monthly only: "1"–"4" or "last".
    pub weeks: Vec<String>,
    /// On the air the whole day it meets, with no times (NETL-004).
    #[serde(default)]
    pub all_day: bool,
    /// "HH:MM" in the listing's zone; empty for "as needed" or all day.
    pub start_time: String,
    /// Optional; empty when not given.
    pub end_time: String,
    /// "" all year, "summer" or "winter" (NETL-008).
    #[serde(default)]
    pub season: String,
}

/// This computer's time zone by IANA name, or UTC if it can't be told.
pub fn local_time_zone() -> String {
    iana_time_zone::get_timezone().unwrap_or_else(|_| "UTC".into())
}

/// Gives every listing without a time zone `zone`, so none of them moves
/// (NETL-047): they were read in this computer's.
pub fn adopt_time_zone(conn: &rusqlite::Connection, zone: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE net_listings SET time_zone = ?1 WHERE coalesce(time_zone, '') = ''",
        params![zone],
    )
}

/// Whether `zone` looks like a time zone name ("UTC", "America/Argentina/Salta").
/// Which names exist is the interface's to know; this keeps out junk.
fn is_zone_name(zone: &str) -> bool {
    !zone.is_empty()
        && zone.len() <= 64
        && zone.chars().all(|c| c.is_ascii_alphanumeric() || "/_+-".contains(c))
        && !zone.starts_with('/')
        && !zone.ends_with('/')
}

/// Checks a time zone the operator chose (NETL-040).
pub fn clean_time_zone(zone: &str) -> Result<String, String> {
    let zone = zone.trim();
    if zone.is_empty() {
        return Err("Choose the time zone the net's times are in.".into());
    }
    if !is_zone_name(zone) {
        return Err(format!("\"{zone}\" isn't a time zone."));
    }
    Ok(zone.to_string())
}

const WEEKS: [&str; 5] = ["1", "2", "3", "4", "last"];

/// "HH:MM" as minutes past midnight, if it is one.
fn minutes(t: &str) -> Option<u32> {
    let (h, m) = t.split_once(':')?;
    if h.len() != 2 || m.len() != 2 {
        return None;
    }
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

/// Checks and tidies one session (NETL-002–004, NETL-008).
pub fn clean_session(mut s: NetSession) -> Result<NetSession, String> {
    for text in [&mut s.frequency, &mut s.start_time, &mut s.end_time, &mut s.season] {
        *text = text.trim().to_string();
    }
    s.repeater_id = s.repeater_id.filter(|id| !id.trim().is_empty());
    if s.repeater_id.is_some() {
        // The repeater's own frequency is shown; free text would only conflict.
        s.frequency.clear();
    }
    if !["", "summer", "winter"].contains(&s.season.as_str()) {
        return Err(format!("\"{}\" isn't a season. Use summer, winter, or all year.", s.season));
    }
    match s.schedule_kind.as_str() {
        "as_needed" => {
            s.weekdays.clear();
            s.weeks.clear();
            s.start_time.clear();
            s.end_time.clear();
            s.all_day = false;
            return Ok(s);
        }
        "weekly" => s.weeks.clear(),
        "monthly" => {
            if s.weeks.is_empty() {
                return Err("Choose which weeks of the month the net meets.".into());
            }
            if let Some(w) = s.weeks.iter().find(|w| !WEEKS.contains(&w.as_str())) {
                return Err(format!("\"{w}\" isn't a week of the month."));
            }
            s.weeks.sort_by_key(|w| WEEKS.iter().position(|x| x == w));
            s.weeks.dedup();
        }
        other => return Err(format!("\"{other}\" isn't a schedule. Use weekly, monthly or as needed.")),
    }
    if s.weekdays.is_empty() {
        return Err("Choose the day or days the net meets.".into());
    }
    if s.weekdays.iter().any(|&w| w > 6) {
        return Err("Weekdays run from 0 (Sunday) to 6 (Saturday).".into());
    }
    s.weekdays.sort_unstable();
    s.weekdays.dedup();
    // 00:00–23:59 is the whole day (NETL-049).
    if s.start_time == "00:00" && s.end_time == "23:59" {
        s.all_day = true;
    }
    if s.all_day {
        s.start_time.clear();
        s.end_time.clear();
        return Ok(s);
    }
    let Some(start) = minutes(&s.start_time) else {
        return Err("Enter the start time as HH:MM, for example 19:00.".into());
    };
    if !s.end_time.is_empty() {
        let Some(end) = minutes(&s.end_time) else {
            return Err("Enter the end time as HH:MM, or leave it blank.".into());
        };
        if end <= start {
            return Err("The end time should be after the start time.".into());
        }
    }
    Ok(s)
}

/// "1st schedule", "2nd schedule"…: a session as the form names it (NETL-009).
fn schedule_name(index: usize) -> String {
    let n = index + 1;
    let suffix = match (n % 10, n % 100) {
        (_, 11..=13) => "th",
        (1, _) => "st",
        (2, _) => "nd",
        (3, _) => "rd",
        _ => "th",
    };
    format!("{n}{suffix} schedule")
}

/// Checks and tidies what was entered (NETL-001–009, NETL-040). With more
/// than one session, a problem says which ("2nd schedule: …"); the word
/// "session" is never shown (NETL-009).
pub fn clean(mut d: NetListingDetails) -> Result<NetListingDetails, String> {
    d.time_zone = clean_time_zone(&d.time_zone)?;
    for text in [&mut d.name, &mut d.run_by, &mut d.checkin_info, &mut d.notes] {
        *text = text.trim().to_string();
    }
    if d.name.is_empty() {
        return Err("A net listing needs a name.".into());
    }
    if d.sessions.is_empty() {
        return Err("A net needs at least one frequency and schedule: when and where it meets.".into());
    }
    d.activity_type = Repository::clean_activity_type(&d.activity_type);
    let several = d.sessions.len() > 1;
    d.sessions = std::mem::take(&mut d.sessions)
        .into_iter()
        .enumerate()
        .map(|(i, s)| clean_session(s).map_err(|e| if several { format!("{}: {e}", schedule_name(i)) } else { e }))
        .collect::<Result<_, _>>()?;
    Ok(d)
}

fn join<T: ToString>(v: &[T]) -> Option<String> {
    (!v.is_empty()).then(|| v.iter().map(T::to_string).collect::<Vec<_>>().join(","))
}

fn blank(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

const COLS: &str = "id, name, activity_type, coalesce(run_by,''), coalesce(checkin_info,''), coalesce(notes,''), coalesce(time_zone,''), coalesce(retired_at,'')";

fn map(r: &rusqlite::Row) -> rusqlite::Result<NetListing> {
    Ok(NetListing {
        id: r.get(0)?,
        details: NetListingDetails {
            name: r.get(1)?,
            activity_type: r.get(2)?,
            run_by: r.get(3)?,
            checkin_info: r.get(4)?,
            notes: r.get(5)?,
            time_zone: r.get(6)?,
            sessions: Vec::new(),
        },
        retired_at: r.get(7)?,
    })
}

const SESSION_COLS: &str = "listing_id, repeater_id, coalesce(frequency,''), schedule_kind, coalesce(weekdays,''), coalesce(weeks,''), all_day, coalesce(start_time,''), coalesce(end_time,''), season";

fn map_session(r: &rusqlite::Row) -> rusqlite::Result<(String, NetSession)> {
    let weekdays: String = r.get(4)?;
    let weeks: String = r.get(5)?;
    Ok((
        r.get(0)?,
        NetSession {
            repeater_id: r.get(1)?,
            frequency: r.get(2)?,
            schedule_kind: r.get(3)?,
            weekdays: weekdays.split(',').filter_map(|w| w.parse().ok()).collect(),
            weeks: weeks.split(',').filter(|w| !w.is_empty()).map(String::from).collect(),
            all_day: r.get(6)?,
            start_time: r.get(7)?,
            end_time: r.get(8)?,
            season: r.get(9)?,
        },
    ))
}

impl Repository {
    /// Fills in each listing's sessions, in order.
    fn with_sessions(&self, mut listings: Vec<NetListing>) -> rusqlite::Result<Vec<NetListing>> {
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT {SESSION_COLS} FROM net_sessions ORDER BY listing_id, position"))?;
        let mut by_listing: std::collections::HashMap<String, Vec<NetSession>> = Default::default();
        for row in stmt.query_map([], map_session)? {
            let (id, s) = row?;
            by_listing.entry(id).or_default().push(s);
        }
        for l in &mut listings {
            l.details.sessions = by_listing.remove(&l.id).unwrap_or_default();
        }
        Ok(listings)
    }

    /// In-use (or, with `retired`, retired) listings by name, each with its
    /// sessions. When each next meets is worked out in the interface (NETL-020).
    pub fn list_net_listings(&self, retired: bool) -> rusqlite::Result<Vec<NetListing>> {
        let filter = if retired { "IS NOT NULL" } else { "IS NULL" };
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {COLS} FROM net_listings WHERE retired_at {filter} ORDER BY name COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], map)?.collect::<rusqlite::Result<Vec<_>>>()?;
        self.with_sessions(rows)
    }

    pub fn get_net_listing(&self, id: &str) -> rusqlite::Result<NetListing> {
        let l = self
            .conn
            .query_row(&format!("SELECT {COLS} FROM net_listings WHERE id = ?1"), params![id], map)?;
        Ok(self.with_sessions(vec![l])?.remove(0))
    }

    /// Whether a repeater exists (retired or not), for checking a listing's.
    pub fn repeater_exists(&self, id: &str) -> rusqlite::Result<bool> {
        Ok(self
            .conn
            .query_row("SELECT 1 FROM repeaters WHERE id = ?1", params![id], |_| Ok(()))
            .optional()?
            .is_some())
    }

    /// Replaces a listing's sessions with `sessions`, in order.
    fn put_sessions(&self, id: &str, sessions: &[NetSession]) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM net_sessions WHERE listing_id = ?1", params![id])?;
        for (i, s) in sessions.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO net_sessions(listing_id, position, repeater_id, frequency, schedule_kind, weekdays, weeks, start_time, end_time, all_day, season) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![id, i as i64, s.repeater_id, blank(&s.frequency), s.schedule_kind, join(&s.weekdays), join(&s.weeks), blank(&s.start_time), blank(&s.end_time), s.all_day, s.season],
            )?;
        }
        Ok(())
    }

    /// Adds a listing with its sessions (already checked with `clean`). The
    /// caller holds a transaction around it, so the two go in together.
    pub fn create_net_listing(&self, d: &NetListingDetails) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO net_listings(id, name, activity_type, run_by, checkin_info, notes, time_zone, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![id, d.name, d.activity_type, blank(&d.run_by), blank(&d.checkin_info), blank(&d.notes), d.time_zone, Utc::now().to_rfc3339()],
        )?;
        self.put_sessions(&id, &d.sessions)?;
        Ok(id)
    }

    /// Replaces a listing's details and sessions (already checked with
    /// `clean`), inside the caller's transaction. Activities started from it
    /// keep their own copies (NETL-011).
    pub fn update_net_listing(&self, id: &str, d: &NetListingDetails) -> rusqlite::Result<()> {
        let n = self.conn.execute(
            "UPDATE net_listings SET name = ?1, activity_type = ?2, run_by = ?3, checkin_info = ?4, notes = ?5, time_zone = ?6 WHERE id = ?7",
            params![d.name, d.activity_type, blank(&d.run_by), blank(&d.checkin_info), blank(&d.notes), d.time_zone, id],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.put_sessions(id, &d.sessions)
    }

    /// Permanently deletes a listing, in use or retired, and its sessions (NETL-012).
    /// Activities started from it keep their own copies. Returns what it was,
    /// for the history.
    pub fn delete_net_listing(&self, id: &str) -> Result<NetListingDetails, String> {
        let l = self.get_net_listing(id).map_err(|_| "That net no longer exists.".to_string())?;
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        self.conn.execute("DELETE FROM net_sessions WHERE listing_id = ?1", params![id]).map_err(|e| e.to_string())?;
        self.conn.execute("DELETE FROM net_listings WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(l.details)
    }

    /// Hides (or, with `retired` false, restores) a listing and so all its
    /// sessions (NETL-010, NETL-009).
    pub fn set_net_listing_retired(&self, id: &str, retired: bool) -> rusqlite::Result<()> {
        let at = retired.then(|| Utc::now().to_rfc3339());
        self.conn
            .execute("UPDATE net_listings SET retired_at = ?1 WHERE id = ?2", params![at, id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-netl-{}.db", Uuid::new_v4()));
        Repository::new(crate::db::open_db(&path).unwrap())
    }

    fn tuesday() -> NetSession {
        NetSession {
            frequency: " 146.520 ".into(),
            schedule_kind: "weekly".into(),
            weekdays: vec![2],
            start_time: "19:00".into(),
            end_time: "19:30".into(),
            ..Default::default()
        }
    }

    fn tuesday_net() -> NetListingDetails {
        NetListingDetails {
            name: " Tuesday Night Net ".into(),
            activity_type: "directed_net".into(),
            checkin_info: " Call sign and name, mobiles first ".into(),
            time_zone: " America/New_York ".into(),
            sessions: vec![tuesday()],
            ..Default::default()
        }
    }

    #[test]
    fn entries_are_checked_and_tidied() {
        // NETL-001, NETL-003, NETL-004, NETL-040
        let d = clean(tuesday_net()).unwrap();
        assert_eq!(d.name, "Tuesday Night Net");
        assert_eq!(d.checkin_info, "Call sign and name, mobiles first");
        assert_eq!(d.time_zone, "America/New_York");
        assert_eq!(d.sessions[0].frequency, "146.520");

        let bad = |f: fn(&mut NetListingDetails)| {
            let mut d = tuesday_net();
            f(&mut d);
            clean(d).unwrap_err()
        };
        assert!(bad(|d| d.name = " ".into()).contains("name"));
        assert!(bad(|d| d.time_zone = " ".into()).contains("time zone"));
        assert!(bad(|d| d.time_zone = "Mars; DROP".into()).contains("isn't a time zone"));
        assert!(bad(|d| d.sessions.clear()).contains("frequency and schedule"));
        assert!(bad(|d| d.sessions[0].weekdays.clear()).contains("day"));
        assert!(bad(|d| d.sessions[0].weekdays = vec![7]).contains("Weekdays"));
        assert!(bad(|d| d.sessions[0].start_time = "7pm".into()).contains("HH:MM"));
        assert!(bad(|d| d.sessions[0].start_time = "24:00".into()).contains("HH:MM"));
        assert!(bad(|d| d.sessions[0].end_time = "18:00".into()).contains("after"));
        assert!(bad(|d| d.sessions[0].schedule_kind = "daily".into()).contains("schedule"));
        assert!(bad(|d| d.sessions[0].schedule_kind = "monthly".into()).contains("weeks"));
        assert!(bad(|d| d.sessions[0].season = "spring".into()).contains("season"));
        assert!(bad(|d| {
            d.sessions[0].schedule_kind = "monthly".into();
            d.sessions[0].weeks = vec!["5".into()];
        })
        .contains("week of the month"));
        // With several sessions, a problem says which (NETL-002).
        assert_eq!(
            bad(|d| d.sessions.push(NetSession { start_time: "".into(), ..tuesday() })),
            "2nd schedule: Enter the start time as HH:MM, for example 19:00."
        );

        // As needed: no days or times.
        let asn = clean_session(NetSession { schedule_kind: "as_needed".into(), all_day: true, ..tuesday() }).unwrap();
        assert!(asn.weekdays.is_empty() && asn.start_time.is_empty() && asn.end_time.is_empty() && !asn.all_day);

        // Weeks are put in order; a repeater replaces free-text frequency.
        let monthly = clean_session(NetSession {
            schedule_kind: "monthly".into(),
            weeks: vec!["last".into(), "2".into(), "2".into()],
            repeater_id: Some("r1".into()),
            ..tuesday()
        })
        .unwrap();
        assert_eq!(monthly.weeks, ["2", "last"]);
        assert_eq!(monthly.frequency, "");
    }

    #[test]
    fn all_day_sessions_have_no_times() {
        // NETL-004, NETL-049
        let s = clean_session(NetSession { all_day: true, ..tuesday() }).unwrap();
        assert!(s.all_day && s.start_time.is_empty() && s.end_time.is_empty());
        assert!(!s.weekdays.is_empty(), "still needs its days");
        let whole = clean_session(NetSession { start_time: "00:00".into(), end_time: "23:59".into(), ..tuesday() }).unwrap();
        assert!(whole.all_day, "00:00–23:59 is all day");
    }

    #[test]
    fn listings_are_stored_with_their_sessions_edited_and_retired() {
        // NETL-002, NETL-008, NETL-009, NETL-010, NETL-012
        let r = repo();
        let mut d = clean(tuesday_net()).unwrap();
        d.sessions.push(clean_session(NetSession { frequency: "7.110".into(), season: "summer".into(), weekdays: vec![1, 3, 5], ..tuesday() }).unwrap());
        d.sessions.push(clean_session(NetSession { frequency: "3.588".into(), season: "winter".into(), all_day: true, ..tuesday() }).unwrap());
        let id = r.create_net_listing(&d).unwrap();
        assert_eq!(r.get_net_listing(&id).unwrap().details, d, "sessions come back in order");

        let mut changed = d.clone();
        changed.sessions.remove(0);
        changed.sessions[0].schedule_kind = "monthly".into();
        changed.sessions[0].weeks = vec!["1".into(), "last".into()];
        r.update_net_listing(&id, &changed).unwrap();
        let got = r.get_net_listing(&id).unwrap().details;
        assert_eq!(got.sessions.len(), 2);
        assert_eq!(got.sessions[0].weeks, ["1", "last"]);
        assert!(r.update_net_listing("missing", &changed).is_err());

        r.set_net_listing_retired(&id, true).unwrap();
        assert!(r.list_net_listings(false).unwrap().is_empty());
        assert_eq!(r.list_net_listings(true).unwrap()[0].details.sessions.len(), 2);
        r.set_net_listing_retired(&id, false).unwrap();
        assert_eq!(r.list_net_listings(false).unwrap().len(), 1);

        // Deleted in use, sessions and all, without retiring it first.
        assert_eq!(r.delete_net_listing(&id).unwrap().sessions.len(), 2);
        assert!(r.get_net_listing(&id).is_err());
        let left: i64 = r.conn.query_row("SELECT COUNT(*) FROM net_sessions", [], |x| x.get(0)).unwrap();
        assert_eq!(left, 0);
        assert!(r.delete_net_listing(&id).is_err());
    }

    #[test]
    fn time_zones_are_kept_and_adopted() {
        // NETL-040, NETL-047
        let r = repo();
        let a = r.create_net_listing(&clean(tuesday_net()).unwrap()).unwrap();
        let mut utc = clean(tuesday_net()).unwrap();
        utc.time_zone = "UTC".into();
        let b = r.create_net_listing(&utc).unwrap();
        assert_eq!(r.get_net_listing(&b).unwrap().details.time_zone, "UTC");

        // Listings from before time zones take this computer's, and only they.
        r.conn.execute("UPDATE net_listings SET time_zone = NULL WHERE id = ?1", params![a]).unwrap();
        assert_eq!(adopt_time_zone(&r.conn, "America/Chicago").unwrap(), 1);
        assert_eq!(r.get_net_listing(&a).unwrap().details.time_zone, "America/Chicago");
        assert_eq!(r.get_net_listing(&b).unwrap().details.time_zone, "UTC");
    }
}
