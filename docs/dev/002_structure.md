# 002 Structure

## Purpose

Define where files go in ani2arr.

Use this document when creating, moving, renaming, splitting, or merging files.

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

Top-level folders exist for real architectural responsibilities.
`shared/` stays narrow.

## Folder rules

### `entrypoints/`

Thin WXT shells only.

Put here:
- background entry setup
- options page shell
- content script shells

Do not put here:
- business logic
- provider logic
- storage logic
- complex orchestration

### `features/`

Feature-local UI.

Put here:
- media modal feature
- mapping explorer feature
- provider settings feature
- feature-local hooks and view state

Do not put here:
- reusable UI primitives
- raw storage access
- raw provider API access
- background messaging logic

### `components/`

Reusable UI primitives and reusable UI composites.

Do not put feature-specific business behavior here.

### `runtime/`

Browser and WXT mechanics.

Put here:
- background startup
- proxy registration
- messaging
- alarms
- broadcasts
- permissions
- service graph composition

Do not put here:
- domain workflows
- raw provider transport
- UI rendering

### `rpc/`

Typed app boundary.

Put here:
- RPC contract
- RPC schemas
- RPC handlers
- handler dependency types

Do not put here:
- startup wiring
- alarms or broadcasts
- raw provider clients
- reusable domain workflows

Rules:
- Organize handlers by app capability, not by vendor.
- Prefer handler modules such as `library.handlers.ts`, `provider.handlers.ts`, and `options.handlers.ts`.
- Keep handlers thin. If logic is reusable or multi-step, move it into `core/`.
- Do not make one handler depend on another handler.

### `core/`

Application domain logic.

Main subdomains:
- `core/mapping/`
- `core/library/`
- `core/anilist/`

#### `core/mapping/`

Owns AniList -> provider identity resolution.

#### `core/library/`

Owns provider library state and workflows.

Put here:
- status resolution
- add and update workflows
- payload resolution for provider mutations
- title indexing
- provider library domain types

Do not put here:
- browser runtime logic
- RPC boundary concerns
- raw provider transport contracts

#### `core/anilist/`

Owns AniList-derived app state beyond raw transport.

### `integrations/`

Raw external systems.

Put here:
- AniList transport
- Sonarr transport
- Radarr transport
- endpoint helpers
- DTO normalization

Do not put app policy here.

### `storage/`

Persistence and cache infrastructure.

Owns storage keys, TTL policies, revision counters, and cache wrappers.

### `shared/`

Support-only code.

Allowed:
- config
- errors
- utils
- canonical shared types reused unchanged

Do not use `shared/` as a catch-all.

## Naming and type placement

- Use literal names.
- Use `index.ts` only as a clear public surface.
- Keep RPC types in `rpc/`.
- Keep domain types in their `core/` owner.
- Keep transport DTOs in `integrations/`.
- Keep storage-local types in `storage/`.
- Put a type in `shared/types/` only when the shape and meaning are reused unchanged.

## File splitting rule

Split by responsibility, not aesthetics.

Good reasons to split:
- one file has multiple reasons to change
- unrelated responsibilities are mixed
- the split reduces navigation cost

Bad reasons to split:
- line count alone
- symmetry alone
- speculative future reuse
- adding another layer of indirection without clarifying ownership
