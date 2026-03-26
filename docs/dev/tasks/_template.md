## Reusable task template

```md
# Task 0000 - <clear-task-name>

## Status
Planned

## Goal
<State the exact goal in 1-3 lines.>

## Why
- <reason 1>
- <reason 2>
- <reason 3>

## Required references
- `docs/dev/001_architecture.md`
- `docs/dev/002_structure.md`
- `docs/dev/011_ai_guardrails.md`

Add any additional required docs here.
Only list the docs actually needed for this task.

## In scope
- <explicit item>
- <explicit item>
- <explicit item>

## Out of scope
- <explicit non-goal>
- <explicit non-goal>
- <explicit non-goal>

## Decisions already made
- <approved ownership decision>
- <approved naming decision>
- <approved placement decision>

## Current problem
<Describe the problem in a concise way using the current codebase reality.>

## Target outcome
<Describe what the repo should look like after this task is complete.>

## Files expected to change
- `src/...`
- `src/...`
- `docs/dev/...`

## Proposed implementation
1. <step 1>
2. <step 2>
3. <step 3>
4. <step 4>

Keep steps concrete and ordered.

## Naming
- folder: `<name>`
- file: `<name>`
- exported symbol: `<name>`

Only include naming entries that matter for this task.

## Ownership justification
- <why the main files belong where they are being placed>
- <why alternatives are worse>

## Commit plan
1. `<commit message 1>`
2. `<commit message 2>`
3. `<commit message 3>`

Use commit messages that match repo style.
Examples:
- `refactor(storage): move revision helpers into revisions.store.ts`
- `refactor(runtime): extract api composition from services index`
- `docs(structure): clarify ownership of domain stores`

## Verification
- [ ] pnpm compile passes
- [ ] pnpm lint passes
- [ ] affected runtime behavior still works
- [ ] imports are updated cleanly
- [ ] obsolete aliases/exports removed

Add task-specific checks below this list.

## Docs to update
- `docs/dev/...`
- `docs/dev/...`

## Diagrams to update
- `docs/dev/diagrams/...`
- `docs/dev/diagrams/...`

## Notes for implementation agent
- <important caveat>
- <important caveat>
- <do not change X as part of this task>
- update this task doc if implementation differs from the approved plan
- record material deviations in `Deviations from plan`
- record the final file list and final commit split if they changed

## Implementation notes
<This section is updated by the implementation agent during the task.>

- <note about a practical constraint discovered during implementation>
- <note about a change from the original plan>
- <note about an additional required supporting change>

Keep each note concise and factual.

## Deviations from plan
<Only fill this in if implementation differs materially from the original proposal.>

- Original plan: <what was originally intended>
- Actual implementation: <what was done instead>
- Reason: <why the change was necessary>

Add one item per meaningful deviation.
If there were no material deviations, write:
- None

## Actual files changed
<Update this during or after implementation if the final file list differs from the expected list.>

- `src/...`
- `src/...`
- `docs/dev/...`

## Final commit plan used
<Update this if the actual commits differ from the proposed commit plan.>

1. `<actual commit message 1>`
2. `<actual commit message 2>`
3. `<actual commit message 3>`

## Final verification notes
<Use this to record anything important discovered during verification.>

- <verification result>
- <follow-up concern if any>
- <anything intentionally deferred>
