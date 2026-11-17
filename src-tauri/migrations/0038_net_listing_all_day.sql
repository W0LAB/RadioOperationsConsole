-- A net on the air around the clock is marked all day rather than given
-- times (docs/features/net-listings.md, NETL-004, NETL-028). One kept as
-- 00:00–23:59 becomes all day (NETL-049).
ALTER TABLE net_listings ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;
UPDATE net_listings SET all_day = 1, start_time = NULL, end_time = NULL
    WHERE schedule_kind IN ('weekly', 'monthly') AND start_time = '00:00' AND end_time = '23:59';
