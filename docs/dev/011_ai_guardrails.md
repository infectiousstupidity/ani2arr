# 011 AI Guardrails

## Purpose

Define how AI agents should work in the ani2arr repo.

This document exists to reduce architectural drift, naming drift, type drift, and unnecessary abstractions.

AI agents must use this document together with:

* `001_architecture.md`
* `002_structure.md`

This document is operational.
It defines how an agent should propose, justify, split, and implement changes.

---

## Core rule

Do not make structural or naming changes silently.

If a task affects architecture, ownership, naming, type placement, exports, abstractions, or file movement, the agent must first propose the change concisely and get human approval before implementing it.

---

## Required workflow

## 1. Understand the existing code first

Before proposing changes, inspect the relevant files and follow the current ownership and naming patterns.

Do not guess the structure.
Do not invent a new local pattern because it looks cleaner in isolation.

## 2. Propose before implementing when the change is structural

The agent must propose first when the change includes any of the following:

* creating or removing folders
* moving files
* renaming files
* changing public exports
* introducing a new shared type
* moving a type to a different owner
* introducing a new abstraction layer
* changing naming conventions
* splitting a large file into multiple files
* merging multiple files into one
* adding a new pattern that other files may follow later

The proposal must be concise and include:

* what will change
* why that placement is correct
* what naming is proposed
* why existing alternatives are worse
* whether docs and diagrams must be updated

## 3. Get naming and ownership verified

If naming is ambiguous, the agent must ask for a decision before implementing.

Examples:

* whether something is a `store`, `cache`, `service`, `resolver`, or `indexer`
* whether a type belongs in `shared/types` or with its owner
* whether something belongs in `runtime` or `rpc`
* whether a module is provider-specific or integration-shared

## 4. Implement only after approval for structural work

Once approved, the agent may implement the agreed plan.

For small non-structural tasks, the agent may implement directly if ownership and naming are already clear from the existing architecture.

## 5. Propose commit splits before implementation when the task is non-trivial

For any task with multiple concerns, the agent should propose the best commit split first.

Each proposed commit should:

* contain one clear concern
* be reviewable on its own
* avoid mixing refactor + rename + behavior change when possible

---

## Repo-specific coding conventions

## Validation and schemas

* Use Valibot where applicable for schemas and derived types.
* Prefer deriving types from schemas when the schema is the canonical source.
* Do not hand-maintain duplicate schema-shaped TypeScript types if the schema can derive them.
* Keep RPC schemas near RPC.
* Keep owner-specific schemas with their owner unless they are truly app-wide.

## Forms

* Use `react-hook-form` for forms.
* Keep form state and schema usage aligned.
* Do not introduce ad hoc form state systems for new forms without strong reason.

## Class name composition

* Use the repo’s `cn` helper for class composition.
* Use the canonical helper from `src/shared/utils/cn.ts`.
* Use it whenever conditional, merged, or optional class names are being composed.
* Do not introduce duplicate class name helpers.
* Do not compose Tailwind class strings with new custom helpers unless approved.

## Styling

* Use Tailwind consistently.
* Prefer existing patterns before introducing new styling conventions.
* Do not introduce new visual abstraction layers unless there is a clear repeated need.

## Path aliases

* Follow the repo’s path alias conventions consistently.
* Do not introduce inconsistent relative import style in newly touched areas.

---

## Architecture rules for agents

## 1. Respect ownership

Every file should have one clear owner.
If ownership is clear, place the file with that owner.
Do not default to `shared/`.

## 2. `shared/` is support-only

`shared/` is only for:

* config
* errors
* utils
* truly cross-cutting types

Do not put these into `shared/` if they clearly belong elsewhere:

* domain logic
* runtime orchestration
* storage infrastructure
* provider transport code
* feature-specific hooks or UI behavior

## 3. Do not use abstraction for symmetry alone

Do not introduce wrappers, facades, or shared helpers just because two files look similar.

Prefer small duplication when it keeps ownership and navigation clearer.

## 4. Do not create architecture by barrel exports

Do not add `index.ts` files automatically.
Use them only when they are the clear public surface of a folder.

## 5. Keep entrypoints thin

If an entrypoint accumulates logic, move that logic into `runtime`, `rpc`, or `core`.

## 6. Keep runtime and RPC separate

* `runtime` owns browser/WXT mechanics
* `rpc` owns typed cross-context app API

Do not blur these without explicit approval.

---

## Type guardrails

Type drift is a major failure mode.
Agents must actively prevent it.

## Required rules

* A type should have one canonical owner.
* Do not duplicate a type unless the duplication is a deliberate boundary decision.
* Do not create aliases that only rename an existing shape without adding meaning.
* Do not import a type, rename it, and re-export it from multiple files without strong reason.
* Keep transport DTOs near transport boundaries.
* Keep domain types near domain owners.
* Keep storage types in `storage`.
* Keep RPC payload and schema-derived types in `rpc`.
* Put a type in `shared/types` only if it is truly cross-cutting.

## Before introducing a new type, check

1. Does this type already exist?
2. Is there already a schema that should derive it?
3. Does the type belong with a stronger owner?
4. Is this a real new semantic type, or just another alias?

If the answer is unclear, propose first.

---

## File splitting guardrails

Split by responsibility, not by aesthetics.

## Good reasons to split

* multiple reasons to change exist in one file
* unrelated responsibilities are mixed
* a real subsystem has emerged
* testing or reading becomes meaningfully easier

## Bad reasons to split

* reducing line count alone
* creating symmetry with neighboring folders
* moving code into many tiny files with indirection
* speculative future reuse

## Required behavior

Before proposing a split, the agent should explain:

* what responsibilities are currently mixed
* what files are proposed
* why the split improves ownership and navigation

---

## UI guardrails

## Feature vs component placement

* Put feature-local UI in the feature folder.
* Put only genuinely reusable UI in `components/`.
* Do not move something into `components/` just because it is visually small.

## Hooks

* Create custom hooks only when they improve clarity.
* Do not extract a one-off hook just to move code out of sight.

## Over-splitting

* A cohesive component may remain in one file even if somewhat long.
* Do not create many tiny component files without clear reuse or separation of responsibility.

---

## Naming guardrails

Use literal, stable names.

## Required domain terms

* Sonarr and Radarr are `providers`
* AniList is `anilist`
* upstream mapping source is `upstream mapping source`
* library means provider library state
* mapping means AniList -> provider identity resolution

## Required suffixes when applicable

* `*.store.ts`
* `*.cache.ts`
* `*.schema.ts`
* `*.handlers.ts`
* `*.resolver.ts`
* `*.indexer.ts`
* `*.constants.ts`

## Avoid vague names

Do not introduce names like:

* `manager`
* `helper`
* `common`
* `misc`

If the name is vague, the ownership is probably vague.

---

## File header convention

Every source file should begin with:

1. one concise purpose comment
2. the relative path on the next line
3. one blank line
4. imports

Example:

```ts
/** Storage-backed revision counters used for cross-context invalidation and refresh signals. */
// src/storage/revisions.store.ts

import { browser } from 'wxt/browser';
```

Agents must preserve and update the path comment when moving files.

---

## Proposal format for structural tasks

Before implementing structural changes, the agent should provide a concise proposal using this shape:

```text
Proposed change
- Move X to Y
- Rename A to B
- Split C into D and E

Why
- ownership
- naming
- dependency direction

Alternatives rejected
- why not option 1
- why not option 2

Docs/diagrams to update
- architecture doc
- structure doc
- runtime diagram
```

Keep it short.
Do not dump large implementation details before approval.

---

## Commit planning rules

For non-trivial work, the agent should propose commit splits before implementation.

## Good commit characteristics

* one concern per commit
* reviewable diff
* clear scope
* no mixing of unrelated changes

## Prefer splitting into separate commits for

* pure moves/renames
* type cleanup
* behavior changes
* doc updates
* diagram updates

## Commit message format

Use conventional scoped messages aligned with repo style.

Examples:

* `refactor(storage): remove unused cache namespaces from CACHE_NAMESPACES`
* `refactor(mapping): move upstream source logic into core/mapping/upstream`
* `refactor(rpc): split settings handlers from handlers.ts`
* `docs(structure): define file placement and naming rules`
* `docs(diagrams): add storage cache flow diagram`

If a task needs several commits, the agent should propose the full sequence first.

---

## Docs and diagrams guardrails

AI agents must not treat docs as optional if the architecture meaning changes.

## Update docs when

* a folder responsibility changes
* a naming convention changes
* a new stable subsystem appears
* ownership rules change
* a new repeated pattern becomes official

## Update diagrams when

* architecture changes materially
* a subsystem gets restructured
* a major flow becomes easier to explain visually than in prose

## Diagram rules

* keep one stable top-level architecture diagram
* use additional focused subsystem diagrams when needed
* prefer several readable diagrams over one giant unreadable diagram
* add short explanatory notes when arrows alone are not enough

---

## Human approval rules

The agent must pause for human approval before:

* introducing a new top-level folder
* changing architecture boundaries
* redefining naming conventions
* moving canonical types
* introducing a new shared abstraction
* changing public import surfaces broadly
* adopting a new library or pattern

If unsure, propose first.

---

## What agents should optimize for

Optimize for:

* obvious ownership
* low navigation cost
* stable naming
* low type drift
* clear diffs
* maintainable structure
* consistency with the repo’s current approved patterns

Do not optimize for:

* theoretical elegance alone
* maximum DRY
* unnecessary symmetry
* speculative abstractions
* proliferation of wrapper files

---

## Stable conclusion

AI agents working in ani2arr must:

* inspect before proposing
* propose before structural implementation
* justify ownership and naming
* preserve canonical types and schema-derived types
* prefer clarity over abstraction
* propose clean commit splits
* update docs and diagrams when architecture meaning changes

This is the baseline workflow for safe AI-assisted development in this repo.
