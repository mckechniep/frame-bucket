-- M6: sites, pages, contracts, snapshot shares. Prod shares table is empty (no deploy has happened); truncate is a no-op guard for dev/preview DBs.

truncate table shares cascade;

-- Sites: a named group of pages produced by one wizard run
create table sites (
  id          text primary key,
  name        text not null check (char_length(name) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Live page manifest of a site
create table site_pages (
  site_id     text not null references sites(id) on delete cascade,
  slug        text not null,
  title       text not null,
  artifact_id text not null references artifacts(id),
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  primary key (site_id, slug)
);
create index site_pages_artifact_idx on site_pages(artifact_id);

-- Design contract cache, keyed by the artifact it derives from
create table contracts (
  artifact_id text primary key references artifacts(id),
  tokens      jsonb not null,
  contract_md text  not null,
  tokens_css  text  not null,
  model_id    text,
  cost        numeric,
  created_at  timestamptz not null default now()
);

-- Shares become site-scoped (BREAKING vs M5 schema; prod has no live data)
alter table shares drop column artifact_id;
alter table shares add column site_id text not null references sites(id);
create index shares_site_idx on shares(site_id);

-- Snapshot of the page manifest at share-creation time
create table share_pages (
  token       text not null references shares(token) on delete cascade,
  slug        text not null,
  title       text not null,
  artifact_id text not null references artifacts(id),
  position    int  not null default 0,
  primary key (token, slug)
);

-- Disable RLS on M6 tables (matches M5 posture; RLS lands in a future milestone)
alter table sites disable row level security;
alter table site_pages disable row level security;
alter table contracts disable row level security;
alter table share_pages disable row level security;
