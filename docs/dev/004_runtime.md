# 004 Runtime

## Purpose

Define what `runtime/` owns in ani2arr.

This document is about browser/WXT mechanics and app composition.
It should be read together with:

* `001_architecture.md`
* `002_structure.md`
* `011_ai_guardrails.md`

---

## Core rule

`runtime/` owns browser-extension mechanics.

If a module mainly exists because the app has:

* background lifecycle
* browser runtime APIs
* alarms
* broadcasts
* permissions
* proxy transport
* service wiring

then it belongs in `runtime/`.

If it mainly defines the typed app API, it belongs in `rpc/`.
If it mainly owns business rules, it belongs in `core/`.

---

## What `runtime/` owns

Put these in `runtime/`:

* background startup and lifecycle
* proxy registration and runtime transport wiring
* alarms and scheduled background work
* broadcasts and runtime message fan-out
* browser permissions
* background-only orchestration
* service graph composition

Typical subfolders:

* `runtime/background/`
* `runtime/messaging/`
* `runtime/composition/`
* `runtime/permissions/`

---

## What `runtime/` does not own

Do not put these in `runtime/`:

* RPC contract or schemas
* mapping rules
* library rules
* AniList domain state
* raw AniList, Sonarr, or Radarr transport code
* UI rendering or feature-local state
* storage primitives or storage policy definitions

---

## Runtime vs RPC

Keep these separate:

* `runtime/` = how contexts start and communicate
* `rpc/` = what typed app methods are exposed across contexts

Use RPC for request/response app actions.
Use runtime messaging for lifecycle signals, broadcasts, permissions, alarms, and transport wiring.

Do not put browser startup or message transport details into `rpc/`.
Do not put app business logic into runtime listeners.

---

## Runtime vs Entrypoints

Entrypoints stay thin.

Rule:
If an entrypoint grows real background or browser orchestration, move that logic into `runtime/`.

Entrypoints should mainly:

* start the correct shell
* call runtime/bootstrap code
* mount UI

They should not become the long-term home for lifecycle or messaging logic.

---

## Dependency rules

`runtime/` may depend on:

* `rpc/`
* `core/`
* `storage/`
* `shared/config`

Avoid the reverse direction where it weakens ownership.

In particular:

* UI should not depend on runtime internals
* `core/` should not own browser mechanics
* `integrations/` should not own runtime orchestration

---

## Runtime-specific anti-patterns

Avoid:

* putting domain rules into background listeners
* putting alarms into `rpc/`
* putting permissions logic into UI helpers as the canonical owner
* mixing proxy transport setup with domain implementation details
* using runtime as a vague catch-all for non-UI code

---

## Decision checklist

Before placing a file in `runtime/`, ask:

1. Does it depend on browser/WXT lifecycle or runtime APIs?
2. Is it about startup, messaging, broadcasts, alarms, permissions, or composition?
3. Is it not better owned by `rpc/`, `core/`, `integrations/`, or `storage/`?

If yes, it likely belongs in `runtime/`.

---

## Stable conclusion

`runtime/` is the browser-mechanics layer.

It owns:

* lifecycle
* transport wiring
* broadcasts
* alarms
* permissions
* composition

It does not own:

* typed app contracts
* domain rules
* raw integrations
* UI
