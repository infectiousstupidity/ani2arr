# 001 Architecture

## Purpose

Define the architectural boundaries for ani2arr.

This document exists to prevent drift.
It defines:

* the main layers
* what each layer owns
* what does not belong in each layer
* allowed dependency direction
* architectural rules that must stay stable during refactors

This is the highest-level source of truth for code placement and dependency boundaries.

---

## Core principles

### 1. Optimize for clear ownership

Every file should have a clear owner.
Do not place files in vague catch-all buckets when ownership is known.

### 2. Optimize for the fewest ambiguous boundaries over time

The goal is not a clever folder tree.
The goal is to reduce uncertainty about where code belongs.

### 3. Separate domain logic from browser/runtime mechanics

App logic and browser-extension mechanics are different concerns.
Do not mix them.

### 4. UI must not reach directly into infrastructure

UI should not depend directly on raw storage or raw external API clients.
UI should go through the app boundary.

### 5. Avoid abstraction for its own sake

Prefer small, obvious duplication over abstractions that increase indirection, navigation cost, or naming drift.

### 6. Keep naming literal and stable

Use the real domain terms used by the project.
Do not rename concepts unnecessarily.

Examples:

* Sonarr and Radarr are providers
* AniList is AniList, not a provider
* upstream mapping source is upstream mapping source
* persistent state files use `*.store.ts`
* cache wrappers use `*.cache.ts`

### 7. Do not use a giant umbrella bucket

Do not use a broad folder such as `lib/` as the main home for most of the app.
Top-level architecture folders should describe responsibility directly.

### 8. Keep `shared/` narrow and support-only

`shared/` is allowed, but only for small cross-cutting support areas and canonical shared types.
It must not become a second architecture root.

---

## Architectural layers

```text
entrypoints -> ui -> rpc -> core -> integrations/storage
                     ^
                  runtime

shared = support-only
```

This is the intended model.

### Entrypoints

Thin WXT shells only.

Owns:

* background entry setup
* options page shell
* content script shells

Does not own:

* business logic
* provider logic
* storage logic
* mapping logic

### UI

User-facing features and reusable components.

Owns:

* feature UIs
* reusable UI primitives and composites
* feature-local hooks and view state

Does not own:

* raw storage access
* raw provider API access
* background orchestration
* domain resolution logic

### RPC

Typed application boundary between UI and background/domain work.

Owns:

* API contract
* input/output schemas
* handler boundary

Does not own:

* browser startup wiring
* alarm scheduling
* tab broadcast orchestration
* raw provider integration details

### Core

Application domain logic.

Owns:

* mapping domain
* library domain
* AniList domain state
* provider routing decisions
* app-level rules

Does not own:

* browser lifecycle
* direct UI rendering
* WXT entry setup

### Integrations

Raw external integrations.

Owns:

* AniList transport
* Sonarr transport
* Radarr transport
* endpoint helpers
* DTO normalization
* provider API contract details

Does not own:

* mapping policy
* app decisions
* UI logic
* runtime messaging

### Storage

Persistence and cache infrastructure.

Owns:

* settings storage
* revision counters
* TTL cache primitives
* persisted maps
* storage-backed cache wrappers
* storage-owned constants and policies

Does not own:

* UI behavior
* provider business logic
* browser startup

### Runtime

Browser/WXT runtime mechanics and app composition.

Owns:

* background lifecycle
* proxy registration
* alarms
* broadcasts
* runtime messaging
* permissions
* service graph composition

Does not own:

* core domain rules
* UI rendering
* provider transport implementation

### Shared

Small cross-cutting support areas.

Includes:

* config
* errors
* utils
* small set of canonical shared types

Must not become a dumping ground.
Must not become a second architecture root.

---

## Final target structure

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

This tree only works if dependency direction is enforced.

---

## Dependency direction

Allowed:

```text
entrypoints -> features/components/runtime/rpc/core/shared
features -> components + rpc + shared/config + feature hooks + small shared/types
components -> shared/config + small shared/types

rpc -> core + shared/config + shared/types
core -> integrations + storage + shared/config + shared/utils + shared/types
runtime -> rpc + core + storage + shared/config
integrations -> shared/utils + shared/types + integration-local helpers
```

Disallowed:

```text
features -X-> storage
features -X-> integrations
components -X-> storage
components -X-> integrations
components -X-> runtime
integrations -X-> ui
core -X-> ui
shared -X-> runtime/core/integrations ownership violations
```

Note:
`shared/` is for support code only.
Do not move code into `shared/` just because it is imported from multiple places.
But if the same type shape and meaning are reused unchanged across multiple domains, keep one canonical type in `shared/types/` instead of cloning it under multiple owners.
Within `shared/types/`, prefer narrow public import surfaces when a subsystem has a clear shared owner.
Example:
provider-related shared types may be imported from `shared/types/providers`, and settings types from `shared/types/options`, instead of routing everything through one top-level barrel.

---

## Layer responsibilities in ani2arr

### `core/mapping`

Owns AniList -> provider identity resolution.

Includes:

* mapping service
* mapping pipeline
* lookup clients used by mapping
* overrides
* upstream mapping source logic
* hint-based resolution
* recorded resolved/unresolved mapping state

Does not include:

* provider library snapshots
* background alarms
* UI state

### `core/library`

Owns provider library state and existence/status logic.

Includes:

* Sonarr library cache/store
* Radarr library cache/store
* title indexing
* status resolution
* live verification against provider
* mutation notifications inside the library domain

Does not include:

* AniList -> provider mapping pipeline
* provider transport implementation

### `core/anilist`

Owns AniList-derived app state beyond raw transport.

Includes:

* metadata store
* baked metadata hydration
* refreshed metadata persistence
* stale/missing metadata refresh policy

Does not include:

* low-level AniList request execution

---

## Why RPC and runtime are separate

RPC is the typed application boundary.
Runtime is the browser-extension execution environment.

RPC answers:

* what methods the app exposes
* what input/output shapes those methods use
* which handler owns the request

Runtime answers:

* how background starts
* how the RPC service is registered
* how contexts communicate
* how alarms, broadcasts, and permissions work

The transport is runtime-flavored.
The contract is still an app boundary and should remain separate.

---

## Why `shared/` exists

`shared/` exists to group small cross-cutting support code so that support modules do not get scattered across the tree.

This is a support bucket, not a main architecture layer.

Good fits for `shared/`:

* pure app-wide config
* shared error helpers
* small generic utilities
* canonical reused types whose shape and meaning stay the same across domains

Bad fits for `shared/`:

* domain logic
* storage infrastructure
* provider transport code
* browser runtime orchestration
* feature-specific hooks or UI logic
* modules that clearly belong to one owner

Rule:
If a module has a clear behavioral owner, do not put it in `shared/`.
If a type has the same shape and meaning across multiple domains, `shared/types/` is the preferred canonical home.
That does not require one flat import surface.
If a subgroup inside `shared/types/` has a clear public API, prefer that subgroup import path over a giant umbrella barrel.

---

## Naming rules

### Required naming patterns

* persistent storage modules: `*.store.ts`
* cache modules: `*.cache.ts`
* top-level public folder export: `index.ts` only when it is the clear public surface
* do not use vague names like `manager`, `helper`, `common`, `misc`

### Domain terms

* Sonarr and Radarr = providers
* AniList = AniList
* upstream mapping source = upstream mapping source
* mapping override = mapping override
* library = provider library state, not mapping state
* integrations = AniList, Sonarr, and Radarr as external systems

### Do not rename the same concept across layers

A concept should have one canonical name.
Do not create aliases unless there is a real semantic difference.

---

## Architecture guardrails

### 1. No large `lib/` bucket

Do not use `lib/` as the main umbrella for most of the repo.
Architecture folders should be named by responsibility.

### 2. `shared/` is support-only

`shared/` may contain support code.
It must not contain domain ownership that belongs elsewhere.

### 3. `shared/config/` must stay small and pure

Only pure app-wide config belongs here.
No hooks.
No browser APIs.
No storage orchestration.
No handler logic.

### 4. `shared/types/` must stay small

Use `shared/types/` for canonical shared types whose shape and meaning are unchanged across domains.
Do not duplicate identical owner-local types just to mark a boundary.
Do not collapse unrelated shared type groups into one mixed file just for convenience imports.

### 5. Storage is infrastructure, not a public convenience layer

Direct storage imports should mostly stay inside core, rpc, and runtime.

### 6. Integrations are not app services

Raw external integration belongs in `integrations/`.
App decisions belong in `core/`.

### 7. Entrypoints stay thin

If an entrypoint grows real logic, move that logic into runtime, rpc, or core.

---

## Decision checklist

Before creating or moving a file, answer:

1. Who owns this code?
2. Is it UI, runtime, domain, storage, or raw integration?
3. Who should be allowed to import it?
4. Does it have side effects?
5. Does it depend on browser APIs?
6. Would placing it elsewhere make ownership less clear?

If ownership is unclear, stop and resolve the ownership before implementing.

---

## Non-goals

This architecture does not aim to:

* maximize abstraction
* eliminate all duplication
* produce the smallest number of files
* mimic a multi-team enterprise codebase

It aims to:

* keep code placement obvious
* keep responsibilities stable
* reduce naming drift
* reduce type drift
* make the repo easier for a human and an AI agent to navigate safely

---

## Stable conclusion

The long-term architecture for ani2arr is:

* thin entrypoints
* UI separated from infrastructure
* RPC as the typed app boundary
* core as domain logic
* integrations as raw external systems
* storage as infrastructure
* runtime as browser/WXT mechanics and composition
* `shared/` as a small, disciplined support area

This is the baseline to defend during future refactors.
