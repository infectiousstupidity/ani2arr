# ani2arr - Agent Guide

This guide is forward-looking. It summarizes the planned architecture in `docs/dev/`, not the repo's exact current folder layout.

Use it as the quick operational map for AI-assisted work. If the current codebase and `docs/dev/` differ, inspect the real code before editing, but follow `docs/dev/` for placement, naming, ownership, and refactor direction. Do not reinforce legacy structure just because it already exists.

## Read order
- `docs/dev/001_architecture.md` - top-level ownership and dependency direction.
- `docs/dev/002_structure.md` - file placement, naming, type ownership, and splitting rules.
- `docs/dev/004_runtime.md` - what belongs in `runtime/`.
- `docs/dev/005_ui.md` - `features/` vs `components/` and UI boundaries.
- `docs/dev/006_rpc.md` - typed app boundary rules.
- `docs/dev/007_core.md` - domain ownership for mapping, library, and AniList state.
- `docs/dev/008_storage.md` - storage infrastructure vs domain-owned stores.
- `docs/dev/009_api.md` - external integrations; target owner is `integrations/`.
- `docs/dev/010_shared.md` - narrow support-only rules for `shared/`.
- `docs/dev/011_ai_guardrails.md` - required workflow for agents.
- `docs/dev/tasks/README.md` and `docs/dev/tasks/_template.md` - use for larger approved work.

## Snapshot
- WXT browser extension for Chrome/Firefox.
- Product scope: inject AniList/AniChart UI and connect those flows to Sonarr and Radarr.
- Stack: TypeScript `strict`, React 19, TanStack Query 5, Valibot, React Hook Form, Radix UI, Tailwind 4.
- Planned flow: `entrypoints -> features/components -> rpc -> core -> integrations/storage`, with `runtime/` owning browser mechanics and composition.

## Commands
- `pnpm run dev`
- `pnpm run dev:firefox`
- `pnpm run compile`
- `pnpm run lint`
- `pnpm run build`
- `pnpm run build:firefox`
- `pnpm run zip`
- `pnpm run zip:firefox`
- `pnpm run generate:anilist-metadata`

## Planned target structure

```text
src/
  entrypoints/
  features/
  components/

  runtime/
  rpc/
  core/
  integrations/
  storage/

  shared/
    config/
    errors/
    utils/
    types/
```

## Layer ownership
- `entrypoints/`: thin WXT shells only. Start shells, mount UI, call bootstrap code. No domain logic.
- `features/`: feature-local UI, hooks, view state, and helper functions.
- `components/`: reusable UI primitives and reusable UI composites.
- `runtime/`: browser/WXT lifecycle, service composition, proxy registration, alarms, broadcasts, messaging, permissions.
- `rpc/`: typed cross-context app boundary, schemas, handlers, handler-boundary types.
- `core/`: application domain logic.
  - `core/mapping/`: AniList -> provider identity resolution.
  - `core/library/`: provider library state, indexing, existence/status logic.
  - `core/anilist/`: AniList-derived app state, metadata hydration, refresh policy.
- `integrations/`: raw AniList, Sonarr, and Radarr transport code, endpoint helpers, DTO normalization, provider API details.
- `storage/`: persistence and cache infrastructure, storage keys, TTL policies, revision counters, storage-backed cache wrappers.
- `shared/`: small cross-cutting support only: config, errors, utils, truly cross-cutting types.

## Dependency rules
- UI goes through the app boundary. `features/` and `components/` must not depend directly on `storage/`, `integrations/`, or `runtime/`.
- `rpc/` defines the app contract. `runtime/` owns transport wiring, startup, alarms, permissions, and broadcasts.
- `core/` may depend on `integrations/`, `storage/`, and narrow `shared/` support modules.
- `integrations/` must not absorb app policy.
- `shared/` is support-only. If a stronger owner exists, keep the file with that owner.
- Do not create or expand a giant umbrella bucket such as `lib/`.

## Domain terms
- Sonarr and Radarr are `providers`.
- AniList is `anilist`, not a provider.
- `mapping` means AniList -> provider identity resolution.
- `library` means provider library state, not mapping state.
- `upstream mapping source` keeps that exact meaning; do not rename it to `static mapping`.
- `integrations` means raw external-system code.

## Naming and placement rules
- Use literal, stable names. Avoid `manager`, `helper`, `common`, `misc`, and similar vague buckets.
- Required suffixes when applicable:
  - `*.store.ts`
  - `*.cache.ts`
  - `*.schema.ts`
  - `*.handlers.ts`
  - `*.resolver.ts`
  - `*.indexer.ts`
  - `*.constants.ts`
- Use `index.ts` only when it is the clear public surface of a folder.
- Prefer owner-based type placement:
  - RPC payloads and schema-derived types in `rpc/`
  - domain types in their `core/` owner
  - transport DTOs in `integrations/`
  - storage-local types in `storage/`
  - only truly cross-cutting types in `shared/types/`
- Transport-local external API shapes in `integrations/` should prefer a `*Dto` suffix when they represent raw request or response payloads. Do not use GraphQL-specific names like `*Node` as the repo convention unless the upstream term itself is the important concept.
- Do not recreate identical nested leaf shapes under different owners just to mark a boundary. If the shape and meaning are the same, keep one canonical type.
- Do not create aliases that just rename an existing type without changing meaning.
- Split files by responsibility, not line count. Prefer small duplication over abstractions that weaken ownership or increase navigation cost.
- Do not create folders for speculative growth or symmetry alone.

## Source file header convention
Every source file should begin with:
1. one concise purpose comment
2. the relative source path on the next line
3. one blank line
4. imports

Example:

```ts
/** Storage-backed revision counters used for cross-context invalidation and refresh signals. */
// src/storage/revisions.store.ts

import { browser } from 'wxt/browser';
```

Update the path comment whenever a file moves.

## Repo-specific implementation rules
- Use Valibot where runtime validation or coercion is actually needed. Prefer deriving types from schemas when the schema is canonical.
- Good fits for Valibot: RPC payloads, persisted settings, import/export payloads, browser-storage reads, and user or external input that enters the app as unknown data.
- Do not add Valibot for private implementation-only shapes such as internal helper returns, internal class state, debug structs, or local bookkeeping with no runtime boundary.
- Use `react-hook-form` for forms.
- Use the canonical `cn` helper from `src/shared/utils/cn.ts` for class composition.
- Use Tailwind consistently and avoid introducing a new visual abstraction layer without a repeated need.
- Follow the repo's path alias conventions consistently.

## Structural-change workflow
- Inspect the relevant code first. Do not guess from folder names alone.
- Propose before implementing any structural change:
  - creating or removing folders
  - moving or renaming files
  - changing public exports
  - introducing a new shared type
  - moving a canonical type to a different owner
  - introducing a new abstraction layer
  - changing naming conventions
  - splitting or merging files
- Structural proposals should stay concise and cover:
  - what changes
  - why the ownership is correct
  - proposed naming
  - rejected alternatives
  - docs/diagrams that must change
- For non-trivial work, propose a commit split before implementation.
- Update docs and diagrams when architecture meaning changes.
- For larger approved work, create or update a task doc in `docs/dev/tasks/` and keep it aligned with the actual implementation if the plan changes.

## Storage-specific rule
- `storage/` owns storage infrastructure, not every stateful file.
- A domain-owned `*.store.ts` may still belong in `core/` if it owns hydration, refresh, merge, indexing, or other domain behavior.
- The word `store` does not determine ownership. Responsibility does.

## Validation before finish
- Run `pnpm run compile`.
- Run `pnpm run lint`.
- Run `pnpm run build` when the change affects shipped code.
- Verify the specifically touched flow still works.
- Remove obsolete aliases, dead exports, and stale type re-exports in the area you touched.

## Operating principle
- Optimize for obvious ownership, low type drift, low navigation cost, stable naming, and clear reviewable diffs.
- Do not optimize for theoretical elegance, symmetry, or maximum DRY if those make the repo harder to navigate.
