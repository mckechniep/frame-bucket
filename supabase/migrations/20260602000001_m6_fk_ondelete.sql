-- M6 addendum: explicit ON DELETE behavior for FKs created in 20260602000000_m6_sites.sql.
--
-- Decisions:
--   shares.site_id -> sites:           CASCADE   (a share is meaningless without its site;
--                                                 consistent with site_pages.site_id)
--   site_pages.artifact_id -> artifacts:  RESTRICT (artifacts are immutable and never deleted
--                                                 by the app — Rule 6. If a delete is ever
--                                                 attempted, fail loudly instead of silently
--                                                 destroying page/share references.)
--   share_pages.artifact_id -> artifacts: RESTRICT (same reasoning — snapshot integrity)
--
-- Note on 20260602000000: its `truncate table shares cascade` also truncated
-- share_view_buckets (FK cascade). Both tables were empty when it ran against prod.

alter table shares
  drop constraint shares_site_id_fkey,
  add constraint shares_site_id_fkey
    foreign key (site_id) references sites(id) on delete cascade;

alter table site_pages
  drop constraint site_pages_artifact_id_fkey,
  add constraint site_pages_artifact_id_fkey
    foreign key (artifact_id) references artifacts(id) on delete restrict;

alter table share_pages
  drop constraint share_pages_artifact_id_fkey,
  add constraint share_pages_artifact_id_fkey
    foreign key (artifact_id) references artifacts(id) on delete restrict;
