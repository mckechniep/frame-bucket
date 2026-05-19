-- Disable RLS on M5 tables per design spec
-- (M6 will enable RLS when real auth lands)
alter table artifacts disable row level security;
alter table shares disable row level security;
alter table share_view_buckets disable row level security;
