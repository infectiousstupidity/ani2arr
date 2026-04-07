## Working rules

- Make the smallest reasonable change that fully solves the task.
- Read nearby code first. Check real callers before changing shared code. Follow existing patterns only when they still make sense.
- Prefer direct code, simple control flow, and local reasoning.
- Do not broaden scope without clear benefit.
- If the request is ambiguous, choose the smallest safe interpretation and state the assumption briefly.
- If required context is recoverable from the repo, tests, or available tools, retrieve it instead of guessing.
- Do not stop at analysis if the task can be completed safely.
- Ask before irreversible or high-impact actions not clearly requested.

## Design rules

- Keep solutions simple, local, and easy to follow.
- Follow YAGNI, KISS, and pragmatic DRY.
- Optimize for a small solo-maintained browser extension, not hypothetical future scale.
- Prefer removing code, collapsing layers, or inlining logic when that makes the result clearer without hurting correctness.
- Do not keep complexity just because it already exists.
- Do not add services, managers, coordinators, factories, registries, wrappers, or similar indirection unless they remove clear current complexity.
- Prefer flat, easy-to-scan control flow over nested branching.
- Split by responsibility before adding more cases to a complex function or file.
- Treat lint warnings about complexity, nesting, callbacks, and parameter count as design feedback.

## Types and ownership

- Keep types with their owning domain.
- Do not use `shared/types` as a catch-all.
- Put domain logic in its owning domain first, not in `shared/`.
- Keep `shared/` minimal and truly cross-cutting.
- Keep small local types, constants, and helpers near usage.
- Extract shared types or helpers only when there is clear reuse or a real public contract.
- If a type is used once, inline it unless the name clearly improves readability.

## File rules

- Every new file and every materially edited file must start with this 2-line header:

```ts
/** Short plain-English description of what this file owns. */
// src/path/to/file.ts
```

* Prefer files under 200 LOC.
* 200 to 300 LOC is acceptable if still easy to scan.
* Over 300 LOC is a split warning.
* One file should do one clear thing.
* Split by responsibility, not file size alone.
* Avoid both enterprise layering and god files.
* "Smallest reasonable change" does not mean "keep everything in one file".

## Change discipline

* Preserve behavior unless the task explicitly asks for behavior changes.
* Keep public shapes and contracts stable unless the task explicitly asks to change them.
* Keep diffs focused. Do not mix requested work with unrelated cleanup.
* Do not rename, move, or broadly reorganize files unless the task requires it.
* Small local splits are allowed when they directly improve ownership, readability, or file responsibility.
* Delete dead aliases, wrappers, and local shells when they no longer earn their keep.

## Verification

* Before finishing, run the cheapest relevant checks for the files you changed.
* Default verification:

  * `pnpm run lint`
  * `pnpm run compile`
* Tests are expensive. Do not add or run them by default just for ceremony.
* Run tests only for behavior changes, bug fixes, shared logic, regression-prone code, or important mapping, parsing, caching, storage, validation, or provider behavior when tests are the cheapest meaningful protection.
* Prefer targeted tests over broad suites.
* Prefer unit tests first.
* Do not add E2E, browser-level tests, large snapshots, or tests for trivial UI, thin wrappers, or obvious pass-through code unless the task clearly needs them.
* If you skip tests or cannot run a check, state why briefly.

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

## Response contract

* Be concise.
* Summarize only what you actually changed.
* Include:
  * what changed
  * important type or ownership decisions
  * verification results
  * blockers or assumptions, if any
* Briefly justify any abstraction you kept.
* Briefly state what was removed, collapsed, or inlined if you simplified something.
* Do not include long plans, speculative future work, or unrelated recommendations unless asked.

## Done when

* The requested change is implemented.
* Behavior matches the request.
* Relevant callers were checked.
* Relevant checks pass.
* Relevant tests pass when tests were needed and run.
* No unrelated abstractions or layers were added.
* Complexity touched by the task was simplified where reasonable.
