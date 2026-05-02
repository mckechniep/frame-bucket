# Notion SDK v5 Migration Notes

> **Read alongside `2026-04-14-frame-bucket-m0-m2.md`.**
> The plan was authored against `@notionhq/client` v4 semantics. The repo
> ships `@notionhq/client@5.20.0`. This file lists every substitution
> required when reading or executing the plan.

## Background

In v5, Notion split the data model into **databases** (containers — can hold
pages, comments, child databases) and **data sources** (the queryable tabular
content). For a simple flat Notion DB created in the UI, there is normally
one data source per database, but the IDs are different and the API surface
forces you to use the data source ID for queries.

## Substitutions

When following the plan literally, apply these renames:

| Plan reads                      | Read it as                               |
| ------------------------------- | ---------------------------------------- |
| `client.databases.query(...)`   | `client.dataSources.query(...)`          |
| `database_id: ...`              | `data_source_id: ...`                    |
| `databaseId: string` (param)    | `dataSourceId: string`                   |
| `env.NOTION_DB_AESTHETICS` etc. | `env.NOTION_DATA_SOURCE_AESTHETICS` etc. |
| `NOTION_DB_*` (env var name)    | `NOTION_DATA_SOURCE_*`                   |
| "database ID" (prose)           | "data source ID"                         |

The response shape (`results`, `has_more`, `next_cursor`) is unchanged, so
the pagination loop in `fetchBucket` works identically.

## Operational impact (`.env.local` setup)

The values you put into `NOTION_DATA_SOURCE_AESTHETICS` etc. must be **data
source IDs**, not database IDs. To get a data source ID from a database you
already have:

```js
const db = await notion.databases.retrieve({ database_id: '<your-db-id>' });
console.log(db.data_sources[0].id); // ← this is the value you want
```

For databases that have only ever had one data source, this ID is stable.
For databases with multiple data sources you'll need to pick the right one
by `name` or by inspecting the schema.

## Tasks affected

- **Task 14** — `src/lib/notion/fetcher.ts`. **Already migrated** at commit
  time (see git history for the diff).
- **Task 17** — Sync orchestrator wires env values into `fetchBucket`.
  Translate `env.NOTION_DB_*` → `env.NOTION_DATA_SOURCE_*` and threaded
  parameter name `databaseId` → `dataSourceId`.
- **Task 19** — Sync API route reads the same env values; same translation.
- **Task 21** — End-to-end sync verification. The 4 IDs you put into
  `.env.local` are data source IDs. Use the snippet above to retrieve them
  before running the route.

## Helper available (not used)

The v5 SDK ships `collectPaginatedAPI(client.dataSources.query, {...})` and
`iteratePaginatedAPI(...)` helpers that handle the pagination loop. The
project intentionally hand-rolls the loop in `fetchBucket` so the unit test
can mock `client.dataSources.query` with a single `vi.fn()` rather than
stubbing the helper. If the loop ever grows beyond ~20 lines or needs
features like rate-limit backoff, swapping in `collectPaginatedAPI` is a
clean refactor.

## Why we didn't rewrite the plan

The original plan stays as-authored history. Mass-substituting names into
it would obscure when the divergence was caught and decided. This file is
the single source of truth for v4→v5 deltas; the plan stays the source of
truth for _control flow and structure_.
