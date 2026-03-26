# 007 Core

## Purpose

Define what `core/` owns in ani2arr.

This document should be read together with:

* `001_architecture.md`
* `002_structure.md`
* `008_storage.md`
* `011_ai_guardrails.md`

---

## Core rule

`core/` owns application domain logic.

It owns:

* mapping domain
* library domain
* AniList domain state
* provider routing decisions
* app-level rules

It does not own browser mechanics, raw integrations, or UI rendering.

Rule:
If it is an application rule or domain workflow, it belongs in `core/`.

---

## Core subdomains

The main `core/` subdomains are:

* `core/mapping/`
* `core/library/`
* `core/anilist/`

These are separate because they own different domain responsibilities.

---

## `core/mapping/`

Owns AniList -> provider identity resolution.

Put here:

* mapping service
* mapping pipeline
* hint lookup
* overrides
* upstream mapping source logic
* provider lookup clients used by mapping
* recorded resolved and unresolved mapping state
* mapping domain types

Do not put here:

* provider library snapshots
* background alarms
* UI state
* raw provider transport

---

## `core/library/`

Owns provider library state and existence/status logic.

Put here:

* provider library cache/store facades
* title indexing
* status resolution
* live verification against provider
* library mutation notifications inside the library domain
* provider library domain types

Do not put here:

* AniList -> provider ID resolution pipeline
* raw provider transport
* browser runtime logic

---

## `core/anilist/`

Owns AniList-derived app state beyond raw transport.

Put here:

* AniList metadata store
* baked metadata hydration
* refreshed metadata persistence
* stale and missing metadata refresh policy
* AniList-derived app state

Do not put here:

* low-level AniList request execution

---

## Core vs integrations

Keep these separate:

* `core/` = app decisions and domain workflows
* `integrations/` = raw external system contracts and transport

Core may depend on integrations.
Integrations must not absorb mapping policy, library policy, or app decisions.

---

## Core vs storage

Core may depend on storage infrastructure.
That is expected.

Examples:

* `core/mapping` may use mapping caches and persistent override state
* `core/library` may use provider library caches
* `core/anilist` may use AniList media cache or storage-backed data

But storage ownership stays in `storage/`.
A domain-owned store can still belong in `core/` if it owns domain behavior rather than storage infrastructure.

---

## Core vs RPC and runtime

Keep these separate:

* `rpc/` = typed app boundary
* `runtime/` = browser/WXT mechanics
* `core/` = business rules and domain workflows

Do not put handler-boundary concerns into `core/`.
Do not put browser lifecycle, alarms, permissions, or broadcasts into `core/`.

---

## Dependency rules

`core/` may depend on:

* `integrations/`
* `storage/`
* `shared/config`
* `shared/utils`
* `shared/types`

Disallowed:

* `core -> ui`

If a file has a stronger owner in `integrations/`, `storage/`, `rpc/`, or `runtime/`, keep it there.

---

## Type ownership

Keep domain types near the domain owner.

Prefer:

* mapping types in `core/mapping/`
* library types in `core/library/`
* AniList domain types in `core/anilist/`

Do not move domain-local types into `shared/types` unless they are truly cross-cutting.

---

## Core-specific anti-patterns

Avoid:

* putting runtime mechanics into `core/`
* putting raw provider transport into `core/`
* putting UI logic into domain modules
* merging mapping and library into one vague subsystem
* moving domain-owned stores into `storage/` just because they persist data
* creating abstractions for symmetry alone

---

## Decision checklist

Before placing a file in `core/`, ask:

1. Is this an application rule or domain workflow?
2. Which subdomain owns it: mapping, library, or anilist?
3. Is it not better owned by `rpc/`, `runtime/`, `integrations/`, or `storage/`?
4. Does placing it in `core/` make ownership clearer?

If yes, it likely belongs in `core/`.

---

## Stable conclusion

`core/` is the domain layer.

It owns:

* mapping
* library
* anilist-derived app state
* provider routing decisions
* app rules

It does not own:

* UI
* browser mechanics
* raw integrations
* storage infrastructure
