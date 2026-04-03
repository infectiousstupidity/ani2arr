## Scope

- This file defines repo-wide rules for Codex.
- More specific `AGENTS.md` files in subfolders override this file.
- The structure below is the target shape after the refactor. It is guidance for direction and ownership, not a description of the current codebase.

## Working style

- Make the smallest reasonable change that fully solves the task.
- Prefer direct code, simple control flow, and local reasoning.
- Read nearby code first. Follow existing patterns only when they still make sense.
- Do not broaden scope without clear benefit.
- If the request is ambiguous, choose the smallest safe interpretation and state the assumption briefly.
- Do not stop at analysis if the task can be completed safely.

## Verification

- Before finishing, run the relevant checks for the files you changed.
- Do not fix lint errors in files unrelated to your change.
- Minimum verification:
  - `pnpm run lint`
  - `pnpm run compile`
- Run tests when the change affects existing tested behavior, shared logic, parsing, validation, matching, caching, or anything regression-prone.
- If you cannot run a check, say why.

## Testing

- Do not add tests by default.
- Add or update tests when they protect important behavior or prevent likely regressions.
- Prefer the cheapest test that gives confidence.
- Prefer unit tests for pure logic.
- Prefer integration-style tests only when behavior crosses boundaries and a unit test would miss the real risk.
- Do not add tests for simple presentational UI, trivial wrappers, or obvious pass-through code unless there is a known bug risk.
- Do not snapshot large UI trees unless there is a clear reason.
- For bug fixes, prefer adding a focused regression test when practical.
- For refactors, do not add broad new test suites unless the refactor changes behavior or exposes untested critical logic.
- Keep tests small, explicit, and easy to maintain.
- Avoid over-mocking. Test real logic, not implementation detail.

## Core rules

- Keep solutions simple, local, and easy to follow.
- Follow YAGNI, KISS, and pragmatic DRY.
- Optimize for a small solo-maintained browser extension, not hypothetical future scale.
- Prefer direct code over extra abstraction layers.
- Do not add services, managers, coordinators, factories, registries, wrappers, or similar indirection unless they remove clear current complexity.
- Keep diffs focused. Do not mix the requested change with unrelated cleanup or restructuring.
- Do not rename, move, or reorganize files unless the task requires it.

## Simplification rule

- Do not assume the current implementation is correct just because it already exists.
- When working in an area, check whether existing layers, wrappers, aliases, indirection, or abstractions still earn their keep.
- Prefer removing code, collapsing layers, or inlining logic when that makes the result clearer and does not hurt correctness.
- If something is over-engineered for the current needs of the project, simplify it instead of preserving it by default.
- Prefer deletion over replacement when a layer is unnecessary.
- Treat existing complexity as something to justify, not protect.

## Types

- Keep types with their owning domain.
- Do not use `shared/types` as a catch-all.
- Import domain types from `anilist`, `providers`, `mapping`, or `options`.
- Keep small local types near usage.
- Extract shared or domain-level types only when there is clear reuse or ownership.
- If a type is used once, inline it unless the name clearly improves readability or defines a real public contract.
- Do not add future-proof types, generic wrappers, or shared aliases without current need.

## File rules

- Every new file and every materially edited file must start with this 2-line header:

```ts
/** Short plain-English description of what this file owns. */
// src/path/to/file.ts
````

* Prefer files under 200 LOC.
* 200 to 300 LOC is acceptable if still easy to scan.
* Over 300 LOC is a split warning.
* Split by responsibility, not file size alone.
* One file should do one clear thing.
* Split when a file mixes UI, state, data fetching, business logic, or unrelated helpers.
* Keep small local constants and types near usage.
* Do not create tiny files or extract abstractions without a clear readability, reuse, or ownership win.
* A file should be understandable in one pass and describable in one sentence.

## Change discipline

* Preserve behavior unless the task explicitly asks for behavior changes.
* Keep public shapes and contracts stable unless the task explicitly asks to change them.
* When refactoring, prefer mechanical cleanup in small slices.
* When touching shared code, verify the actual callers before changing ownership or abstractions.
* Do not introduce new layers to prepare for later.
* Delete dead local shells, aliases, and wrappers when they do not earn their keep.
* If an existing abstraction remains, it should be justifiable by current usage.

## Target ownership after refactor

```txt
src/
  entrypoints/   - thin WXT boot files for each extension context
  rpc/           - typed cross-context API boundary
  background/    - background-only browser/runtime behavior
  anilist/       - AniList API, schemas, caching, and AniList-derived logic
  providers/     - Sonarr/Radarr clients, validation, types, and provider-local library logic
  mapping/       - matching, overrides, upstream mappings, and resolution pipeline
  options/       - persisted options schema, types, and store logic
  options-page/  - options page UI and page-specific workflows
  content/       - injected site/page adapters and host-surface wiring
  features/      - reusable product UI modules
  shared/        - minimal cross-cutting low-level code only
  debug/         - dev/debug-only helpers
```

## Ownership rules

* Put domain logic in its owning domain first, not in `shared/`.
* Keep `shared/` small. It is for truly cross-cutting low-level code, not overflow.
* `features/` is for reusable product UI, not page glue.
* `options-page/` and `content/` are surface/UI folders.
* `entrypoints/` should stay thin.

## Response contract

* Be concise.
* Summarize only the changes you actually made.
* Include:

  * what changed
  * important type or ownership decisions
  * verification results
  * blockers or assumptions, if any
* If you kept an existing abstraction, be able to justify it briefly.
* If you simplified something, say what was removed, collapsed, or inlined.
* Do not include long plans, speculative future work, or unrelated recommendations unless asked.

## Done when

* The requested change is implemented.
* Behavior matches the request.
* Relevant checks pass.
* Relevant tests pass when tests exist or were needed for the change.
* No unrelated abstractions or layers were added.
* Existing complexity touched by the task was simplified where reasonable.
* New files, names, and extracted types are justified by current usage, not hypothetical future reuse.
