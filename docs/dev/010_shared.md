# 010 Shared

## Purpose

Define what `shared/` owns in ani2arr.

This document should be read together with:

* `001_architecture.md`
* `002_structure.md`
* `011_ai_guardrails.md`

---

## Core rule

`shared/` is for small cross-cutting support code only.

It is not a second architecture root.
It must not become a dumping ground.

If a file has a clear behavioral owner in `runtime/`, `rpc/`, `core/`, `integrations/`, or `storage/`, it belongs with that owner instead.
If a type is reused unchanged across multiple domains, `shared/types/` may be the clearest canonical home.

---

## What `shared/` owns

`shared/` includes:

* `shared/config/`
* `shared/errors/`
* `shared/utils/`
* `shared/types/`

These are support areas, not domain owners.

---

## `shared/config/`

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

Rule:
`shared/config/` must stay small and pure.

---

## `shared/errors/`

Put here:

* shared error normalization
* shared error codes
* shared error utilities

Use this folder for cross-cutting error support, not for owner-specific business errors.

---

## `shared/utils/`

Put here:

* small generic utilities
* logging helpers
* metrics helpers
* generic path helpers only if truly cross-cutting

Do not put here:

* domain-specific helpers with a clear owner
* provider-specific helpers
* feature-specific hooks or UI behavior

---

## `shared/types/`

Put here:

* canonical shared types when the same shape and meaning are reused unchanged across multiple domains
* full provider resource types reused unchanged across integrations, library flows, and RPC
* canonical shared projections reused unchanged across multiple domains when no stronger owner adds clarity

Do not put here:

* domain-local types
* transport-local DTOs that are endpoint-local or integration-specific
* storage-local types
* RPC-local payload types
* aliases that only rename an existing type without adding meaning

Rule:
`shared/types/` must stay small.
Type drift hides here first, so use it sparingly.

Do not read this as "every reused type goes here".
Use `shared/types/` only when a single canonical shared type is clearly better than duplicating the same shape under multiple owners.
This applies across the repo, not just to provider resource types.
Use this as the default rule:
1. If a type is used in two or more domains with the same shape and meaning, put it in `shared/types/`.
2. If a type is only used inside one domain, keep it in that domain.
3. If a type crosses domains but its shape or meaning changes, keep separate types for those distinct roles.
Example:
keep a canonical full `SonarrSeries` resource in `shared/types/`.
If `SonarrSeriesSnapshot` is reused unchanged across storage, library, RPC, and UI consumers, it may also stay in `shared/types/`.
Keep a snapshot with the library owner only when it is truly a library-local projection.

## Shared type import surfaces

Canonical ownership and import surface are separate decisions.

Use a narrow public surface when a shared type subgroup has a clear owner.

Prefer:

* provider-related shared types from `shared/types/providers`
* options and settings types from `shared/types/options`

Use the top-level `shared/types` barrel as a convenience surface only when it improves readability for a file consuming several unrelated shared type groups.

---

## Dependency rules

Allowed examples:

* `features -> shared/config + small shared/types`
* `components -> shared/config + small shared/types`
* `rpc -> shared/config + shared/types`
* `core -> shared/config + shared/utils + shared/types`
* `runtime -> shared/config`
* `integrations -> shared/utils + shared/types`

Disallowed:

* `shared -> runtime/core/integrations` ownership violations

`shared/` supports other layers.
It should not absorb their responsibilities.

---

## Shared-specific anti-patterns

Avoid:

* putting domain logic into `shared/`
* putting runtime orchestration into `shared/`
* putting storage infrastructure into `shared/`
* putting provider transport code into `shared/`
* moving feature-specific hooks or UI behavior into `shared/`
* creating shared abstractions just for symmetry

---

## Type guardrails

Rules:

* a type should have one canonical source
* put a type in `shared/types` when a shared canonical definition is clearer than duplicating the same type under multiple owners
* do not duplicate a type unless the duplication is a deliberate boundary decision
* do not create aliases that only rename an existing shape
* do not force every shared type through one umbrella barrel when a narrower shared public surface is clearer

Before adding a new shared type, ask:

1. Does this type already exist?
2. Is the shape and meaning actually the same everywhere it will be used?
3. Would keeping one canonical shared type avoid useless duplication?
4. Would an owner-local copy add any real semantic or boundary value?

If unclear, do not default to `shared/types`.

---

## Decision checklist

Before placing code in `shared/`, ask:

1. Is this small support code rather than a domain owner?
2. Is it truly cross-cutting?
3. Is this a canonical shared type rather than owner-local behavior?
4. Will putting it in `shared/` reduce duplication without weakening ownership?

If no, keep it with the stronger owner.

---

## Stable conclusion

`shared/` exists to hold a small, disciplined set of support code:

* config
* errors
* utils
* canonical shared types whose shape and meaning stay the same across domains

It must stay narrow.
If behavior ownership is clear, do not put it in `shared/`.
