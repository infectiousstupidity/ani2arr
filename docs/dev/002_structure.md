# 002 Structure

## Purpose

Define where files go in ani2arr.

This document is practical.
It answers:

* where new files should be placed
* how folders are intended to be used
* naming conventions
* file splitting rules
* type ownership rules
* what to avoid

Use this document when creating, moving, renaming, or splitting files.

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

Top-level folders exist for real architectural responsibilities.
`shared/` exists only for small cross-cutting support code.

---

## Folder responsibilities

## `entrypoints/`

Thin WXT shells only.

Put here:

* background entry file
* options page entry file
* content script entry files

Do not put here:

* domain logic
* provider integration logic
* storage logic
* complex orchestration

If an entrypoint grows real logic, move that logic into `runtime/`, `rpc/`, or `core/`.

---

## `features/`

Product UI features.

Put here:

* media modal feature
* mapping explorer feature
* provider settings feature
* browse-card actions
* feature-local hooks
* feature-local UI state
* feature-local helper functions

Do not put here:

* reusable UI primitives
* raw storage access
* raw provider API access
* background messaging logic
* generic cross-feature utilities

Rule:
If the code only makes sense inside one feature, keep it inside that feature.

---

## `components/`

Reusable UI primitives and reusable UI composites.

Put here:

* buttons
* dialogs
* selects
* switches
* badges
* toasts
* generic reusable layout wrappers
* small reusable composites used by multiple features

Do not put here:

* feature-specific business behavior
* direct storage calls
* provider API calls
* runtime messaging logic

Rule:
If a component is only used by one feature and is tightly coupled to that feature, it belongs in that feature, not in `components/`.

---

## `runtime/`

Browser/WXT runtime mechanics and app composition.

Put here:

* background startup logic
* service graph composition
* proxy registration
* alarms
* broadcasts
* runtime messaging
* permissions
* background-only orchestration

Do not put here:

* mapping rules
* provider library rules
* transport client implementation
* UI rendering

Typical subfolders:

* `runtime/composition/`
* `runtime/messaging/`
* `runtime/background/`
* `runtime/permissions/`

Rule:
If it depends on browser-extension lifecycle or browser runtime APIs, it usually belongs here.

---

## `rpc/`

Typed application boundary.

Put here:

* RPC contract
* RPC schemas
* RPC handlers
* handler dependency types

Do not put here:

* browser startup wiring
* alarms
* tab broadcasts
* raw provider clients
* domain implementation details that belong in `core/`

Typical subfolders:

* `rpc/handlers/`

Rule:
RPC defines what the app exposes across contexts.
It does not own runtime bootstrapping.

---

## `core/`

Application domain logic.

Main subdomains:

* `core/mapping/`
* `core/library/`
* `core/anilist/`

### `core/mapping/`

Put here:

* mapping service
* mapping pipeline
* hint lookup
* overrides
* upstream mapping source logic
* provider lookup clients used by mapping
* mapping domain types

Do not put here:

* provider library cache/store
* raw provider transport
* browser runtime logic

### `core/library/`

Put here:

* provider library cache/store facades
* title indexing
* status resolution
* library mutation notifications inside the library domain
* provider library domain types

Do not put here:

* AniList -> provider ID resolution pipeline
* raw provider transport
* browser runtime logic

### `core/anilist/`

Put here:

* AniList metadata store
* baked metadata hydration
* refreshed metadata persistence
* AniList-derived app state

Do not put here:

* low-level AniList request execution

Rule:
If it is an application rule or domain workflow, it belongs in `core/`.

---

## `integrations/`

Raw external systems.

Put here:

* AniList transport code
* Sonarr transport code
* Radarr transport code
* endpoint helpers
* DTO normalization
* integration-specific request helpers
* shared Arr transport code if truly shared

Do not put here:

* mapping policy
* library policy
* UI logic
* runtime messaging
* app decisions

Typical subfolders:

* `integrations/anilist/`
* `integrations/sonarr/`
* `integrations/radarr/`
* `integrations/shared/` only if truly needed

Rule:
If it talks to an external system and is mainly about that system’s contract, it belongs here.

---

## `storage/`

Persistence and cache infrastructure.

Put here:

* settings store
* revision counters
* TTL cache primitives
* persisted map primitives
* storage-backed caches
* storage keys
* cache namespaces
* storage policies

Do not put here:

* feature UI logic
* provider transport logic
* domain business rules
* runtime startup logic

Rule:
If it exists to persist data, cache data, invalidate data, or wrap browser storage, it belongs here.

---

## `shared/`

Small cross-cutting support code only.

`shared/` is not a second architecture root.
It is a support bucket.

### `shared/config/`

Put here:

* pure app-wide schemas
* default factories
* query key builders
* pure app-wide constants

Do not put here:

* hooks
* browser APIs
* storage orchestration
* handler logic
* integration logic

### `shared/errors/`

Put here:

* shared error normalization
* shared error codes
* shared error utilities

### `shared/utils/`

Put here:

* small generic utilities
* logging helpers
* metrics helpers
* generic path helpers only if truly cross-cutting
* the canonical `cn` class-composition helper at `src/shared/utils/cn.ts`

Do not put here:

* domain-specific helpers with a clear owner

### `shared/types/`

Put here:

* truly cross-cutting shared types only

Do not put here:

* domain-local types
* transport-local DTOs
* aliases that only rename an existing type without adding meaning

Rule:
If a file has a clear owner elsewhere, do not put it in `shared/`.

---

## Naming conventions

## File suffixes

Use these suffixes consistently when applicable:

* `*.store.ts` = persistent state or storage-backed state
* `*.cache.ts` = cache wrapper or cache implementation
* `*.schema.ts` = schema definition
* `*.types.ts` or `types.ts` = local type definitions when needed
* `*.service.ts` = domain or integration service only when it is actually a service
* `*.handlers.ts` = grouped RPC handlers
* `*.resolver.ts` = resolution logic
* `*.indexer.ts` = indexing logic
* `*.constants.ts` = local constants owned by that folder

Do not invent many near-synonyms for the same concept.

Avoid names like:

* `manager`
* `helper`
* `common`
* `misc`
* `stuff`

If the file name is vague, the ownership is probably vague too.

---

## Domain naming rules

Use the project’s real domain terms consistently.

* Sonarr and Radarr are `providers`
* AniList is `anilist`
* AniList is not called a provider
* upstream mapping source is `upstream mapping source`
* do not rename upstream mapping source to `static mapping`
* library means provider library state
* mapping means AniList -> provider identity resolution
* override means mapping override

Do not create multiple names for the same thing.

---

## Export conventions

### `index.ts`

Use `index.ts` only when it is the clear public surface of a folder.

Good use:

* a folder exports its intended public API

Bad use:

* a file exists only to create another layer of indirection
* re-exporting for no clear reason

Rule:
Prefer direct imports when they are clearer.
Do not create barrel files automatically.

---

## File header convention

Every source file should begin with:

1. a one-line purpose comment
2. the relative source path on the next line
3. one blank line
4. imports

Example:

```ts
/** Storage-backed revision counters used for cross-context invalidation and refresh signals. */
// src/storage/revisions.store.ts

import { browser } from 'wxt/browser';
```

Rules:

* keep the purpose line concise
* state what the file owns or does
* keep the path accurate when files move

---

## Type ownership rules

Type drift is one of the main failure modes in this repo.
Avoid it aggressively.

### Canonical ownership

A type should have one canonical home.
Do not define the same shape in multiple places unless duplication is a deliberate boundary decision.

### Place types with their owner

Prefer:

* mapping types in `core/mapping/`
* library types in `core/library/...`
* integration DTOs in `integrations/...`
* RPC types and schemas in `rpc/`
* storage-specific types in `storage/`
* only truly cross-cutting types in `shared/types/`

### Keep one canonical shape when the meaning is identical

Do not recreate an identical leaf shape in multiple owners just to mark a boundary.

Examples:

* if an AniList title shape means the same thing in both transport and app code, keep one canonical owner
* if an image sub-shape is identical and semantically stable, reuse it instead of creating `FooRecord`, `FooDto`, and `Foo` variants

Create a separate integration-local type only when at least one of these is true:

* the transport shape is actually different
* the transport meaning is narrower or broader
* the transport wrapper is specific to one endpoint
* keeping it separate prevents a real boundary leak

Rule:
Do not duplicate every nested transport sub-shape automatically.
Boundary ownership does not justify alias churn by itself.

### Avoid meaningless aliases

Do not create a new alias just to rename an existing type if the meaning has not changed.

Bad:

* importing a type from one file
* renaming it locally
* re-exporting it again from another file
* creating a chain of aliases that all mean the same thing

### Re-export carefully

If a type is re-exported, there must still be one clear canonical source.

### When duplication is acceptable

Duplication can be acceptable when it creates a clean boundary.

Examples:

* a transport DTO intentionally differs from a domain type
* an RPC payload intentionally differs from internal domain state

If duplicated, the distinction must be real and documented by naming.

### When to use Valibot

Use Valibot when the code needs runtime validation or coercion.

Good fits:

* RPC input and output shapes
* persisted settings and imported/exported data
* browser storage payloads that are read back as unknown
* external or user-provided data that must be validated before use
* canonical schema-owned contracts that multiple callers should share

Do not introduce Valibot just to describe an internal TypeScript-only shape.

Usually no schema is needed for:

* private helper return types
* internal class state
* debug-only snapshots that never cross a trust boundary
* small local interfaces used only inside one implementation file

Rule:
If there is no runtime boundary, no coercion, and no validation need, prefer plain TypeScript types.

---

## File splitting rules

Split by responsibility first, not by line count.

## Good reasons to split a file

* it has multiple reasons to change
* it contains multiple clearly separate responsibilities
* one part is reusable and stable on its own
* reading/testing becomes meaningfully easier
* the file is difficult to navigate because unrelated logic is mixed together

## Bad reasons to split a file

* the file is "a bit long"
* the split creates several tiny files with heavy indirection
* the split forces constant folder navigation without improving understanding
* the split exists only to look architecturally neat

## LOC guideline

Do not use a hard line count rule.
Use this soft guidance instead:

* under ~200 LOC is usually fine
* 200-400 LOC may still be fine if responsibility is tight
* above ~400 LOC should trigger a review of whether responsibilities are mixed

A cohesive 350-line file is better than five scattered 70-line files with indirection.

---

## UI splitting rules

UI over-splitting is another failure mode.

## Keep a component together when

* it has one clear responsibility
* splitting would only move JSX around
* subparts are not reused
* local state and rendering are tightly connected

## Split a component when

* subparts have their own state
* subparts are reused elsewhere
* visual sections have clearly different responsibilities
* the parent becomes hard to read because unrelated concerns are mixed

## Hooks

Create a custom hook only when it clarifies behavior, not just to move code out of sight.

Bad pattern:

* extracting logic into a hook that is used once and makes the feature harder to follow

Good pattern:

* extracting repeated or clearly behavioral state logic into a named hook

---

## Abstraction rules

Do not abstract for symmetry alone.
Do not abstract just because two files look similar.

Prefer duplication when:

* the duplicated logic is small
* the responsibilities are clearer when separate
* abstraction would create unclear ownership
* abstraction would force jumping through multiple files to understand one behavior

Abstract when:

* the behavior is truly shared
* the abstraction has a single clear owner
* the abstraction reduces real maintenance cost
* the abstraction improves clarity instead of hiding it

Rule:
Clarity beats DRY when the abstraction would make the repo harder to navigate.

---

## When to create a new folder

Create a new folder only when at least one of these is true:

* a real subsystem exists
* multiple related files need a clear shared owner
* the folder meaning is obvious and stable

Do not create a folder for:

* one tiny helper file
* speculative future growth
* aesthetic symmetry only

---

## Move rules

When moving files during refactors:

1. move by ownership, not by superficial similarity
2. update the file header path comment
3. remove obsolete aliases and re-export chains
4. update related docs if the architecture meaning changes
5. update diagrams if the subsystem shape changes

Do not move files casually just because a new tree looks nicer.

---

## Quick placement guide

Use this checklist before creating a file.

### Put it in `features/` if

* it is feature-local UI or feature-local state

### Put it in `components/` if

* it is reusable UI used across features

### Put it in `runtime/` if

* it depends on browser/WXT lifecycle, messaging, alarms, permissions, or composition

### Put it in `rpc/` if

* it defines or serves the typed cross-context app boundary

### Put it in `core/` if

* it is application logic or domain behavior

### Put it in `integrations/` if

* it is raw external system code

### Put it in `storage/` if

* it persists, caches, invalidates, or wraps stored state

### Put it in `shared/` if

* it is small support code with no stronger owner elsewhere

If two locations seem valid, prefer the one with the stronger owner.

---

## Common mistakes to avoid

* putting domain logic into `shared/`
* putting raw integrations into UI code
* putting runtime mechanics into `core/`
* putting app policy into `integrations/`
* re-exporting the same type through multiple files
* creating aliases that rename without adding meaning
* splitting files just to reduce line count
* creating one-file folders without a real subsystem
* inventing vague names instead of naming the real thing
* composing conditional class-name strings directly when the canonical `cn` helper applies

---

## Stable conclusion

The repo structure should make ownership obvious.

Use:

* top-level folders for real architecture
* `shared/` only for small support code
* owner-based type placement
* literal names
* minimal but meaningful splits

If a proposed structure increases indirection
