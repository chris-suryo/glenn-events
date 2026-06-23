-- 015_event_timezone.sql
-- Event times are stored as timestamptz (a UTC instant); Postgres does not keep the
-- original wall-clock offset, so rendering an event's *local* time requires knowing
-- the event's timezone. Adds an IANA timezone per event, backfills existing rows, and
-- defaults new rows to US Eastern (matches the app's fallback in lib/utils.ts). The
-- event create flow can capture a more specific zone later.

alter table events add column if not exists timezone text;
update events set timezone = 'America/New_York' where timezone is null;
alter table events alter column timezone set default 'America/New_York';
