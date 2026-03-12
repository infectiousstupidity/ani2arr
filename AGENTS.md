# ani2arr – Agent Guide

Use this as a quick map; keep it updated when structure or responsibilities change.

## Snapshot
- WXT browser extension (Chrome/Firefox) that injects AniList/AniChart overlays and talks to Sonarr and Radarr.
- Stack: TypeScript (strict), React 19, TanStack Query 5, Radix UI, Tailwind 4.
- Data flow: UI/features → `src/shared/queries` (React Query + RPC proxy) → `src/rpc/handlers` (background) → `src/services/*` (domain) → `src/clients/*` (external HTTP).

## Commands (run from repo root)
- `pnpm run dev` / `pnpm run dev:firefox` – dev server.
- `pnpm run lint` – must pass.
- `pnpm run build` – must pass.
- `pnpm run generate:anilist-metadata` – rebuild baked AniList index.

## Entry points (`src/entrypoints`)
- `background/` – registers RPC, schedules mapping refresh, message routing.
- `anilist-anime.content/` – MediaActions on AniList detail pages; routes series to Sonarr and movies to Radarr.
- `anilist-browse.content/` – overlays on AniList browse/search.
- `anichart-browse.content/` – overlays on AniChart browse, including movie cards for Radarr.
- `options/` – options UI (Sonarr, Radarr, mappings, UI, advanced).

## Key paths
- RPC contracts: `src/rpc/index.ts`, `src/rpc/schemas.ts`
- RPC handlers: `src/rpc/handlers/*`
- Clients: `src/clients/anilist/`, `src/clients/sonarr.api.ts`, `src/clients/radarr.api.ts`, `src/clients/base-arr.client.ts`
- Services: `src/services/mapping/*`, `src/services/anilist/*`, `src/services/library/sonarr/*`, `src/services/library/radarr/*`, `src/services/providers/*`
- Shared queries: `src/shared/queries/*`
- Options storage: `src/shared/options/storage.ts`
- Cache/persistence: `src/cache/query-cache.ts`, `src/cache/persist-options.ts`
- UI overlays/components: `src/features/media-overlay/*`, `src/features/media-modal/*`, `src/shared/ui/*`

## Conventions
- Use `@/*` aliases; avoid deep relative paths.
- Wrap RPC calls in `try/catch` and normalize errors (`src/shared/errors/error-utils.ts`); use `withRetry` for retries.
- Messages/broadcasts must include `_a2a: true`.
- Do not store credentials outside `browser.storage.local`; never put secrets in URLs or persisted queries.
- Adding host permissions requires updating `wxt.config.ts`.

## Validation before finish
- `pnpm run lint` and `pnpm run build` clean.
- Background responds to ping; options permission flow works; overlays inject once. 
