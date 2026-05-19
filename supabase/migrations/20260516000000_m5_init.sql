create extension if not exists "pgcrypto";

create table artifacts (
  id              text          primary key,
  html            text          not null,
  html_source     text,
  meta            jsonb         not null,
  parent_id       text          references artifacts(id) on delete set null,
  iteration_round int           not null default 0,
  created_at      timestamptz   not null default now()
);

create index artifacts_parent_idx     on artifacts (parent_id);
create index artifacts_created_at_idx on artifacts (created_at desc);

create table shares (
  token            text          primary key,
  artifact_id      text          not null references artifacts(id) on delete cascade,
  name             text          not null check (char_length(name) between 1 and 120),
  revoked_at       timestamptz,
  last_viewed_at   timestamptz,
  view_count       int           not null default 0,
  created_at       timestamptz   not null default now()
);

create index shares_artifact_idx on shares (artifact_id);
create index shares_created_idx  on shares (created_at desc);
create index shares_live_idx     on shares (token) where revoked_at is null;

create table share_view_buckets (
  token              text          not null references shares(token) on delete cascade,
  bucket_started_at  timestamptz   not null,
  primary key (token, bucket_started_at)
);
