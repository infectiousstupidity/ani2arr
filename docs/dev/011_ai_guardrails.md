# 011 AI Guardrails

## Purpose

Define how AI agents should work in the ani2arr repo.

This is a solo-dev browser extension.
The repo should stay easy to understand, easy to navigate, and easy to change without a large-team process or enterprise-style architecture.

The goals are:
- avoid unnecessary complexity
- avoid unnecessary verbosity
- avoid unnecessary abstractions and wrapper layers
- avoid duplication and parallel implementations
- reduce architectural, naming, and type drift
- prevent AI-generated sprawl that makes small changes harder over time

## Required workflow

### 1. Inspect first

Read the relevant code before proposing or editing.
Do not guess from folder names alone.

### 2. Propose before structural changes

Get approval before:
- creating or removing folders
- moving or renaming files
- changing public exports
- introducing a new shared type
- moving a canonical type to a different owner
- introducing a new abstraction layer
- changing naming conventions
- splitting or merging files

Keep the proposal short and include:
- what changes
- why the ownership is correct
- proposed naming
- rejected alternative
- docs that must change

### 3. Prefer simplification

Default to the simplest structure that fits the current scope.
Do not add indirection unless it clearly improves ownership, navigation, or correctness.

In particular:
- do not make RPC handlers call other RPC handlers
- do not introduce wrappers for symmetry alone
- do not split files only to reduce line count
- do not create new layers for a problem that one existing file or function can handle
- do not create parallel helpers, duplicate types, or near-identical abstractions just because they look cleaner in isolation
- do not optimize for hypothetical future scale over current clarity

### 4. Keep layer boundaries clear

- UI goes through RPC.
- RPC exposes typed app actions.
- Core owns reusable workflows.
- Runtime owns browser mechanics and composition.
- Integrations own raw external API details.
- Shared stays narrow.

### 5. Validate before finish

- Run `pnpm run compile`.
- Run `pnpm run lint`.
- Run `pnpm run build` when shipped code changed.
- Verify the specifically touched flow still works.

## Repo-specific rules

### Reuse existing shared modules

- Reuse existing `src/shared/*` modules when they already own the concern.
- Prefer existing utilities over creating parallel files with overlapping responsibility.
- Use `src/shared/errors` for shared error codes, error creation, normalization, and related helpers.
- Use `src/shared/utils` for genuinely generic utilities that are already established there.
- Use `src/shared/types` only for canonical shared types reused unchanged across domains.
- If an existing shared module is close but not quite right, extend it only when the ownership still fits. Otherwise, place the new code with the stronger owner.

### Schemas

- Use Valibot where runtime validation is actually needed.
- Prefer deriving types from schemas when the schema is canonical.
- Keep RPC schemas near RPC.
- Do not add schema overhead for private implementation-only shapes.

### Forms

- Use `react-hook-form` for forms.

### Styling

- Use Tailwind consistently.
- Use the canonical `cn` helper from `src/shared/utils/cn.ts`.

### Types

- A type should have one canonical owner.
- Do not duplicate a type unless the boundary meaning changes.
- Do not create aliases that only rename an existing shape.
- Put a type in `shared/types` only when it is truly cross-cutting and reused unchanged.

## Operating principle

Optimize for a small, pragmatic codebase maintained by one person.
Prefer obvious ownership, fewer files, fewer layers, lower navigation cost, and less ceremony.
When in doubt, choose the simpler structure and the smaller diff.
