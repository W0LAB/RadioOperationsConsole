-- Each net listing keeps the time zone its days and times are written in, by
-- IANA name ('UTC', 'America/New_York') (docs/features/net-listings.md,
-- NETL-040). Listings from before take this computer's zone when the app
-- starts (NETL-047), which SQL can't know, so it is filled in after.
ALTER TABLE net_listings ADD COLUMN time_zone TEXT;
