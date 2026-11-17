-- A net listing holds one or more sessions, each one way the net meets: its
-- own frequency and schedule, and optionally a season
-- (docs/features/net-listings.md, NETL-002, NETL-008). Each listing so far
-- becomes a listing with one session.

CREATE TABLE net_sessions_moving AS
    SELECT id AS listing_id, repeater_id, frequency, schedule_kind, weekdays, weeks,
           start_time, end_time, all_day
    FROM net_listings;

CREATE TABLE net_listings_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    activity_type TEXT NOT NULL DEFAULT 'directed_net',
    run_by TEXT,
    checkin_info TEXT,
    notes TEXT,
    -- The zone the sessions' days and times are written in, by IANA name (NETL-040).
    time_zone TEXT,
    created_at TEXT NOT NULL,
    retired_at TEXT
);
INSERT INTO net_listings_new (id, name, activity_type, run_by, checkin_info, notes, time_zone, created_at, retired_at)
    SELECT id, name, activity_type, run_by, checkin_info, notes, time_zone, created_at, retired_at FROM net_listings;
DROP TABLE net_listings;
ALTER TABLE net_listings_new RENAME TO net_listings;

CREATE TABLE net_sessions (
    listing_id TEXT NOT NULL REFERENCES net_listings(id) ON DELETE CASCADE,
    -- Order within the listing, from 0.
    position INTEGER NOT NULL,
    -- A repeater from the directory, or else free-text frequency.
    repeater_id TEXT REFERENCES repeaters(id),
    frequency TEXT,
    -- 'weekly', 'monthly' or 'as_needed'.
    schedule_kind TEXT NOT NULL,
    -- Weekdays, 0 = Sunday, comma-separated: '2' or '1,2,3,4,5'.
    weekdays TEXT,
    -- Monthly only: weeks of the month, comma-separated: '2,4' or 'last'.
    weeks TEXT,
    -- 'HH:MM' in the listing's time zone; none when all day.
    start_time TEXT,
    end_time TEXT,
    all_day INTEGER NOT NULL DEFAULT 0,
    -- '' all year, 'summer' or 'winter' (NETL-008).
    season TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (listing_id, position)
);
INSERT INTO net_sessions (listing_id, position, repeater_id, frequency, schedule_kind, weekdays, weeks, start_time, end_time, all_day)
    SELECT listing_id, 0, repeater_id, frequency, schedule_kind, weekdays, weeks, start_time, end_time, all_day
    FROM net_sessions_moving;
DROP TABLE net_sessions_moving;
