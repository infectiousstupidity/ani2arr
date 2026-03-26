# 008 Storage

## Purpose

Define what `src/storage/` owns in ani2arr.

This document exists to make the storage boundary explicit.
It answers:

* what belongs in `storage/`
* what does not belong in `storage/`
* what is stored vs cached vs derived
* when something should be a `*.store.ts` file in `storage/`
* when a `store` belongs to `core/` instead
* naming rules for storage modules
* storage-specific placement rules

This document must be read together with:

* `001_architecture.md`
* `002_structure.md`
* `011_ai_guardrails.md`

---

## Core rule

`storage/` owns storage infrastructure.
It does not own every file that happens to use the word `store`.

A module belongs in `storage/` when its main responsibility is one of these:

* persisting data
* caching data
* invalidating data
* wrapping browser storage
* defining storage keys, namespaces, or TTL policies
* providing reusable storage primitives

A module does **not** belong in `storage/` just because it:

* keeps in-memory state
* manages domain data
* coordinates domain refresh behavior
* hydrates domain objects
* uses cached data internally

---

## What `storage/` owns

`storage/` owns the infrastructure layer for persisted and cached state.

That includes:

* settings storage
* revision counters
* TTL cache primitives
* persisted map primitives
* storage-backed cache wrappers
* storage-owned constants and policies

This matches the architecture doc and is the canonical definition of the storage layer.

---

## What `storage/` does not own

`storage/` does **not** own domain state just because that domain state is cached or persisted somewhere.

Examples that do **not** belong in `storage/`:

* `core/anilist/metadata-store.ts`
* `core/library/sonarr/store.ts`
* `core/library/radarr/store.ts`
* `core/mapping/mapping-service.ts`

Reason:
These files own domain behavior.
They may read from or write to `storage/`, but their main responsibility is not storage infrastructure.

---

## Important distinction: storage store vs domain store

The word `store` is overloaded.
This repo uses two different meanings.

## 1. Storage-owned store

A storage-owned store belongs in `storage/`.

Characteristics:

* wraps browser storage or a persistence mechanism directly
* exists primarily to persist, retrieve, or invalidate data
* is reusable as storage infrastructure
* does not own domain workflows

Examples:

* settings store
* revisions store
* user mapping persistent state store

## 2. Domain-owned store

A domain-owned store belongs in `core/`.

Characteristics:

* owns domain behavior
* may hydrate, merge, refresh, index, or transform domain data
* may use caches from `storage/`
* is not reusable as generic storage infrastructure

Examples:

* AniList metadata store
* Sonarr library store
* Radarr library store

Rule:
A file named `*.store.ts` does not automatically belong in `storage/`.
Ownership is determined by responsibility, not suffix alone.

---

## Concrete ownership rules

## Put it in `storage/` if

* it wraps `browser.storage`
* it defines a TTL cache primitive
* it defines a persisted map primitive
* it provides a storage-backed cache wrapper
* it owns storage keys
* it owns cache namespaces
* it owns cache TTL policy constants
* it exists to store, load, clear, or invalidate persisted data as infrastructure

## Put it in `core/` instead if

* it owns domain refresh behavior
* it owns merge logic between multiple sources
* it owns domain indexing
* it owns domain fallback logic
* it owns domain-specific hydration
* it owns business rules around when cached data is used or refreshed
* it coordinates several storage-backed primitives into domain behavior

---

## Current intended examples

## Belongs in `storage/`

* `settings.store.ts`

  * persists public options and secrets
  * exposes snapshot helpers
  * wraps storage items directly

* `revisions.store.ts`

  * stores revision counters used for invalidation

* `ttl-cache.ts`

  * reusable cache primitive

* `persisted-map.ts`

  * reusable persistence primitive

* `user-mapping.store.ts`

  * persistent mapping override/ignore/rejection/blocked state

* `extension-mapping.cache.ts`

  * storage-backed cache wrapper for resolved mapping results/failures

* `upstream-mapping.cache.ts`

  * storage-backed cache wrapper for upstream mapping data

* `provider-library.cache.ts`

  * storage-backed cache wrapper for lean provider library data

* `anilist-media.cache.ts`

  * storage-backed cache wrapper for AniList media

* `lookup.cache.ts`

  * storage-backed provider lookup caches

* `keys.ts`

  * storage keys, revision keys, cache namespaces

* `policies.ts`

  * storage TTL and persistence policy constants

## Does not belong in `storage/`

* `core/anilist/metadata-store.ts`

  * domain-owned metadata workflow
  * uses persistence, but is not storage infrastructure

* `core/library/sonarr/store.ts`

  * domain-owned provider library cache/store behavior
  * uses caches from storage, but owns domain refresh/index logic

* `core/library/radarr/store.ts`

  * same reasoning as Sonarr library store

* `core/mapping/upstream/upstream-mapping-store.ts`

  * domain-owned mapping source behavior using storage-backed caches
  * not generic storage infrastructure

---

## Storage vs cache vs derived state

These terms must stay distinct.

## Stored state

Persisted state that should survive across sessions.

Examples:

* settings
* secrets
* revision counters
* user mapping overrides and ignores
* persistent cache entries

## Cached state

Stored or in-memory data kept to avoid expensive recomputation or network requests.

Examples:

* AniList media cache
* upstream mapping cache
* provider lookup cache
* provider library lean cache
* extension mapping result/failure cache

A cache may be persisted or in-memory.
A cache is defined by purpose, not by location.

## Derived state

State computed from other state.

Examples:

* public options derived from settings + secrets
* query invalidation signals derived from revisions
* domain status derived from cached provider library data + live provider checks

Do not treat derived state as canonical persistent state unless there is a strong reason.

---

## What should be stored vs cached

## Store when

* the data is user-controlled state
* the data is required across sessions
* the data is canonical app state
* the data is needed for synchronization or invalidation

Examples:

* settings
* secrets
* mapping overrides
* ignores
* blocked/rejected candidates
* revision counters

## Cache when

* the data can be recomputed or refetched
* the data is mainly for performance or resilience
* staleness is acceptable within a controlled policy

Examples:

* AniList media
* upstream mappings
* provider lookups
* provider library snapshots
* extension mapping resolution results/failures

## Do not store in `storage/` when

* the file owns domain rules rather than storage concerns
* the persistence is only one implementation detail of a larger domain workflow

---

## TTL and persistence policy rules

`storage/` owns generic TTL and persistence policy definitions.

Examples:

* stale TTL
* hard TTL
* error fallback TTL
* namespace definitions

Rule:
If a constant exists mainly because storage or cache infrastructure needs it, it belongs in `storage/policies.ts` or a storage-owned constants file.

If a constant exists because a domain workflow makes a business decision, it belongs with that domain owner instead.

---

## Naming rules for storage modules

Use literal names.

## Required suffixes

* `*.store.ts` = persistent state or storage-backed state module
* `*.cache.ts` = cache wrapper or cache implementation
* `*.constants.ts` = local storage constants when not part of `keys.ts` or `policies.ts`

## Canonical naming patterns

* `settings.store.ts`
* `revisions.store.ts`
* `user-mapping.store.ts`
* `lookup.cache.ts`
* `provider-library.cache.ts`
* `upstream-mapping.cache.ts`

## Avoid vague names

Do not use names like:

* `storage-manager.ts`
* `cache-helper.ts`
* `common-storage.ts`
* `misc-cache.ts`

If a file name is vague, its ownership is probably vague.

---

## File placement rules inside `storage/`

Use flat placement by default.

Do not create nested storage folders unless a real subsystem appears.

Good default:

* one file per storage primitive or storage-backed wrapper
* shared keys and policies near the root of `storage/`
* one `index.ts` only if it is the clear public surface for storage

Do not create subfolders just for symmetry.

---

## Export rules

`storage/index.ts` may exist as the public surface of the storage layer.
That is acceptable because `storage/` is a real infrastructure subsystem.

However:

* do not export obsolete aliases
* do not keep dead exports for convenience
* do not create multiple canonical import paths for the same storage primitive without reason

Rule:
There should be one obvious import path for each storage primitive.

---

## How domain code should use `storage/`

Domain code may depend on storage infrastructure.
That is expected.

Examples:

* `core/mapping` may use mapping caches and persistent override state
* `core/library` may use provider library caches
* `core/anilist` may use AniList media cache or browser storage-backed data
* `runtime` may use settings and revisions
* `rpc` may trigger invalidation/reset logic through storage-owned modules

But domain code should not be moved into `storage/` just because it consumes storage.

Dependency does not determine ownership.
Responsibility determines ownership.

---

## Storage-specific anti-patterns

Avoid these mistakes:

* putting domain-owned stores into `storage/`
* putting browser runtime orchestration into `storage/`
* putting provider-specific business logic into cache wrappers
* mixing storage primitives with domain refresh workflows in one file
* duplicating storage keys in multiple places
* duplicating TTL policy constants in multiple places
* creating aliases that rename the same cache/store without adding meaning
* treating every persistent thing as a storage-layer responsibility

---

## Decision checklist

Before creating or moving a file into `storage/`, answer:

1. Is this file primarily about persistence or caching infrastructure?
2. Does it wrap storage directly?
3. Is it reusable as storage infrastructure?
4. Does it avoid owning domain workflows?
5. Would moving it into `storage/` make ownership clearer rather than weaker?

If the file mainly owns domain behavior, it does not belong in `storage/`.

---

## File header convention

Every storage file should begin with:

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

Keep the purpose line literal and concise.

---

## Stable conclusion

`storage/` owns storage infrastructure, not all stateful code.

Put a file in `storage/` when it exists to:

* persist
* cache
* invalidate
* wrap storage
* define storage policies and keys

Keep a file in `core/` when it exists to:

* own domain refresh behavior
* hydrate domain objects
* merge sources
* index domain data
* apply business rules around cached or persisted data

The word `store` does not determine ownership.
Responsibility determines ownership.
