# Integration evidence

Use this as a task-local working note (not a new permanent design document). Store screenshots/notes in a temporary directory outside the repository, and report paths. Commit only minimal sanitized regression fixtures when needed.

## Preflight

- Request / scope / exclusions:
- Starting commit / dirty worktree:
- Browser tools and versions:
- Website access restrictions / permitted identity source:
- Relevant existing adapters:

## Discovery (repeat for each layout)

| Field | Observed evidence |
| --- | --- |
| Surface and concrete URLs | |
| URL predicate and excluded URL | |
| Before screenshot (path, viewport) | |
| Card / scan / observer selectors and counts | |
| Minimal sanitized HTML excerpt | |
| Identity source and exact sample ID | |
| Title / format / optional poster source | |
| Mount selector, computed positioning / overflow / stacking | |
| Existing presentation / corner / direction | |
| Navigation and mutation behavior | |
| Coverage (identifiable / sampled; skipped and why) | |
| Missing/conflicting data or access limitations | |

Sample at least two distinct identities per layout when available. Include sequels, multiple occurrences and differing formats when present. Record observed values, not predictions. No secrets, personal profiles, signed URLs or full network dumps.

## Implementation gate

For each layout: ready or blocked, with reason. Cite real DOM samples, screenshot and identity evidence. State which existing components are reused and explain any unavoidable shared change. Do not implement an unverified layout.

## Validation (repeat relevant rows for each surface)

Use PASS / FAIL / BLOCKED / N/A. Explain N/A or blocked; record evidence and whether live, fixture, mock or manual.

| Check | Result / evidence |
| --- | --- |
| Correct source ID, title, format and mount | |
| Invalid/missing/conflicting identity rejected | |
| Repeated anime: one overlay per physical card | |
| TV/movie routing; existing mappings respected | |
| Cross-site status for confirmed identity links | |
| Default and hover/focus states; native clicks intact | |
| Normal and narrow viewport screenshots | |
| Filter/sort/scroll/pagination and recycled cards | |
| Browse/detail/back/forward navigation and cleanup | |
| UI settings and unsupported pages | |
| No new console errors or duplicate request flood | |
| Mock/disposable provider behavior (no real writes) | |
| Chromium installed-extension check | |
| Firefox installed-extension check | |
| Representative existing site regression | |
| Focused tests, lint, compile, validate | |
| Generated manifest / privacy / description review | |

## Handoff

- Files changed and commit SHA (if committed):
- Commands run and exact results:
- Evidence paths:
- Supported surfaces / known limitations:
- Human interventions and skill/tooling gaps:
