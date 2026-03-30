# 007 Core

## Purpose

Define what `core/` owns in ani2arr.

## Core rule

`core/` owns application domain logic.

It owns:
- mapping rules
- library rules
- AniList-derived app state
- provider routing decisions
- reusable app workflows

It does not own:
- UI rendering
- browser mechanics
- raw provider transport contracts
- RPC boundary concerns

If behavior is reusable, multi-step, or central to app policy, it belongs in `core/`.

## Subdomains

### `core/mapping/`

Owns AniList -> provider identity resolution.

Put here:
- mapping pipelines
- overrides
- upstream mapping source logic
- provider lookup logic used for mapping

### `core/library/`

Owns provider library state and workflows.

Put here:
- existence and status logic
- title indexing
- add and update workflows
- provider mutation payload resolution
- provider library domain types and snapshots

Do not put here:
- raw Sonarr or Radarr client contracts
- browser lifecycle logic
- RPC handler concerns

### `core/anilist/`

Owns AniList-derived app state beyond raw transport.

Put here:
- metadata hydration
- refresh policy
- AniList-derived stores and services

## Core vs other layers

- `core/` decides what the app does.
- `integrations/` talks to external systems.
- `rpc/` exposes typed app actions.
- `runtime/` composes and wires the app inside the browser.

If an RPC handler would need to call another handler to reuse behavior, that shared behavior belongs in `core/`.

## Type ownership

- Keep domain types with their domain owner.
- Reuse canonical shared types when the meaning is unchanged.
- Create a core-local type only when the domain shape or meaning is genuinely different.

## Anti-patterns

Avoid:
- putting runtime mechanics into `core/`
- putting raw transport code into `core/`
- moving domain logic into RPC for convenience
- creating abstractions only for symmetry

## Stable conclusion

`core/` is the place for app workflows.
If it is the real behavior of the product, it probably belongs here.
