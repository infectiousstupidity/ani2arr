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

If a file has a clear owner in `runtime/`, `rpc/`, `core/`, `integrations/`, or `storage/`, it belongs with that owner instead.

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

* truly cross-cutting shared types only

Do not put here:

* domain-local types
* transport-local DTOs
* storage-local types
* RPC-local payload types
* aliases that only rename an existing type without adding meaning

Rule:
`shared/types/` must stay small.
Type drift hides here first, so use it sparingly.

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

* a type should have one canonical owner
* put a type in `shared/types` only if it is truly cross-cutting
* do not duplicate a type unless the duplication is a deliberate boundary decision
* do not create aliases that only rename an existing shape

Before adding a new shared type, ask:

1. Does this type already exist?
2. Does it have a stronger owner elsewhere?
3. Is it truly cross-cutting, or just currently reused?

If unclear, do not default to `shared/types`.

---

## Decision checklist

Before placing code in `shared/`, ask:

1. Is this small support code rather than a domain owner?
2. Is it truly cross-cutting?
3. Is there no stronger owner elsewhere?
4. Will putting it in `shared/` reduce duplication without weakening ownership?

If no, keep it with the stronger owner.

---

## Stable conclusion

`shared/` exists to hold a small, disciplined set of support code:

* config
* errors
* utils
* truly cross-cutting types

It must stay narrow.
If ownership is clear, do not put it in `shared/`.
