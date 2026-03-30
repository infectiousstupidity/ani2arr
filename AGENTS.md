# ani2arr - Agent Guide

Use this as the short operating map for AI-assisted work.

If the codebase and `docs/dev/` differ, inspect the real code first, then move the repo toward the documented target. Do not preserve accidental structure just because it already exists.

## Read first
- `docs/dev/001_architecture.md` - layer ownership and dependency direction.
- `docs/dev/002_structure.md` - placement and naming rules.
- `docs/dev/006_rpc.md` - RPC boundary rules.
- `docs/dev/007_core.md` - domain workflow ownership.
- `docs/dev/009_api.md` - raw integration ownership.
- `docs/dev/011_ai_guardrails.md` - required workflow for agents.

## Snapshot
- WXT browser extension for Chrome and Firefox.
- Product scope: inject AniList and AniChart UI, then connect those flows to Sonarr and Radarr.
- Stack: TypeScript `strict`, React 19, TanStack Query 5, Valibot, React Hook Form, Radix UI, Tailwind 4.
- Target flow: `entrypoints -> features/components -> rpc -> core -> integrations/storage`, with `runtime/` owning browser mechanics and composition.

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

## Target structure

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

## Ownership
- `entrypoints/`: thin WXT shells only.
- `features/`: feature-local UI, hooks, and view state.
- `components/`: reusable UI primitives and reusable UI composites.
- `runtime/`: browser lifecycle, messaging, permissions, alarms, broadcasts, and service composition.
- `rpc/`: typed cross-context boundary: contract, schemas, handlers, and handler dependency types.
- `core/`: domain workflows and app rules.
- `integrations/`: raw AniList, Sonarr, and Radarr transport code.
- `storage/`: persistence and cache infrastructure.
- `shared/`: narrow support-only code and canonical shared types.

## Hard rules
- UI goes through RPC. `features/` and `components/` must not depend directly on `runtime/`, `integrations/`, or `storage/`.
- Organize `rpc/handlers/` by app capability, not by vendor.
  Good fits: `library.handlers.ts`, `provider.handlers.ts`, `options.handlers.ts`.
- RPC handlers stay thin. They may validate input, ensure configuration, call one core workflow, translate boundary errors, and trigger boundary-side refresh or invalidation.
- RPC handlers must not call other RPC handlers. If logic is shared between handlers, move it into `core/`.
- `core/` owns reusable workflows and multi-step app behavior such as add, update, mapping, status resolution, and payload resolution.
- `runtime/` composes services and wires transport. It must not become a second domain layer.
- `integrations/` owns raw external API details only. It must not absorb app policy.
- `shared/` is not a fallback bucket. Use it only for truly cross-cutting support code or canonical shared types reused unchanged.

## Domain terms
- Sonarr and Radarr are `providers`.
- AniList is `anilist`, not a provider.
- `mapping` means AniList -> provider identity resolution.
- `library` means provider library state, not mapping state.
- `upstream mapping source` keeps that exact meaning.
- `integrations` means raw external-system code.

## Naming and placement
- Use literal, stable names. Avoid `manager`, `helper`, `common`, and `misc`.
- Required suffixes when applicable:
  - `*.store.ts`
  - `*.cache.ts`
  - `*.schema.ts`
  - `*.handlers.ts`
  - `*.resolver.ts`
  - `*.indexer.ts`
  - `*.constants.ts`
- Use `index.ts` only as a clear public surface.
- Keep type ownership with the strongest owner:
  - RPC payloads and schema-derived types in `rpc/`
  - domain types in `core/`
  - transport DTOs in `integrations/`
  - storage-local types in `storage/`
  - canonical reused types with unchanged meaning in `shared/types/`
- Do not duplicate identical types or create aliases that only rename an existing shape.
- Split files by responsibility, not line count. Prefer less indirection over perfect symmetry.

## Structural changes
- Inspect the real code first.
- Propose before implementing when you are:
  - creating or removing folders
  - moving or renaming files
  - changing public exports
  - introducing a new shared type
  - moving a canonical type to a different owner
  - introducing a new abstraction layer
  - changing naming conventions
  - splitting or merging files
- Keep the proposal short and include:
  - what changes
  - why the ownership is correct
  - proposed naming
  - rejected alternative
  - docs or diagrams that must change

## Validation before finish
- Run `pnpm run compile`.
- Run `pnpm run lint`.
- Run `pnpm run build` when the change affects shipped code.
- Verify the specifically touched flow still works.
- Remove dead exports, obsolete aliases, and stale type re-exports in the touched area.

## Operating principle
- Optimize for obvious ownership, low indirection, low navigation cost, and reviewable diffs.
- Do not optimize for symmetry, theoretical elegance, or maximum DRY when those make the repo harder to change.
