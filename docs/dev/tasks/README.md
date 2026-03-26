# docs/dev/tasks/ README and Task Template

## Purpose

`docs/dev/tasks/` contains focused implementation plans for AI-assisted work.

These docs are temporary, task-specific, and operational.
They do not replace the stable architecture docs.
They sit on top of them.

Use a task doc when:

* a change is large enough to need planning
* one agent will plan and another will implement
* architecture context is too large to pass in full every time
* naming, ownership, or commit splitting should be decided before coding

Do not use a task doc for:

* tiny one-file edits
* casual brainstorming
* unresolved architecture debates
* duplicate summaries of the stable docs

---

## Relationship to the stable docs

The stable docs define the rules of the repo.
The task docs define one approved piece of work inside those rules.

A task doc must not override the stable docs.
If a task requires changing architecture rules, that change must be approved and reflected in the stable docs first.

Relevant stable docs usually include:

- `docs/dev/001_architecture.md` - top-level ownership and dependency direction.
- `docs/dev/002_structure.md` - file placement, naming, type ownership, and splitting rules.
- `docs/dev/004_runtime.md` - what belongs in `runtime/`.
- `docs/dev/005_ui.md` - `features/` vs `components/` and UI boundaries.
- `docs/dev/006_rpc.md` - typed app boundary rules.
- `docs/dev/007_core.md` - domain ownership for mapping, library, and AniList state.
- `docs/dev/008_storage.md` - storage infrastructure vs domain-owned stores.
- `docs/dev/009_api.md` - external integrations; target owner is `integrations/`.
- `docs/dev/010_shared.md` - narrow support-only rules for `shared/`.
- `docs/dev/011_ai_guardrails.md` - required workflow for agents.
- `docs/dev/tasks/README.md` and `docs/dev/tasks/_template.md` - use for larger approved work.

Each task doc should list exactly which stable docs are required references.

---

## What a task doc should contain

A good task doc should answer:

* what is changing
* why it is changing
* what is in scope
* what is out of scope
* which decisions are already made
* what files are expected to change
* how the work should be split into commits
* how the result should be verified
* what docs or diagrams must be updated

A task doc should be concise, explicit, and implementation-oriented.

---

## Naming convention

Use a numeric prefix and a clear slug.

Examples:

* `0001_extract_runtime_composition.md`
* `0002_move_clients_to_integrations.md`
* `0003_split_mapping_handlers.md`

Avoid vague names like:

* `cleanup.md`
* `refactor.md`
* `changes.md`
* `fix-stuff.md`

If the name is vague, the task is probably vague.

---

## Status convention

Each task doc should include one of these statuses:

* `Planned`
* `Approved`
* `In progress`
* `Done`
* `Superseded`

Use:

* `Planned` when the task is being drafted
* `Approved` when the direction is accepted and ready for implementation
* `In progress` when implementation has started
* `Done` when the task is complete
* `Superseded` when replaced by another task or no longer valid

---

## Lifecycle

### Create a task doc when

* the task spans multiple files
* a structure or naming decision must be preserved across implementation
* the work should be handed from one agent to another
* commit planning matters

### Update a task doc when

* scope changes materially
* naming decisions change
* a commit plan changes
* verification steps change

### Mark a task doc done when

* implementation is complete
* follow-up docs/diagrams are updated
* the task is no longer the active implementation guide

Do not let old task docs silently remain active.
Mark them clearly.

---

## Rules for planning agents

A planning agent should:

* inspect the relevant code first
* follow the stable docs
* describe the change concisely
* make ownership and naming decisions explicit
* define clear scope and non-scope
* propose a clean commit plan
* identify which docs/diagrams need updates

A planning agent should not:

* implement architecture changes without approval
* create new patterns casually
* leave naming or ownership decisions vague
* write a task doc that depends on unstated assumptions

---

## Rules for implementation agents

An implementation agent should:

* read the task doc first
* read the listed required stable docs
* stay within the defined scope
* flag any ambiguity before continuing
* follow the approved naming and ownership decisions
* implement in the proposed commit slices when practical
* update docs/diagrams if the task explicitly requires it

An implementation agent should not:

* widen scope silently
* change naming without approval
* improvise new architecture during implementation
* ignore a listed verification step

---

## Recommended directory structure

```text
/docs/dev/tasks/
  README.md
  _template.md
  0001_extract_runtime_composition.md
  0002_move_clients_to_integrations.md
```

Use `_template.md` as the reusable source for new task docs.

---


## Template usage rules

When creating a new task doc from the template:

* fill in every section that matters
* remove placeholder lines
* keep the task concise
* do not leave vague scope
* do not leave naming undecided if the task depends on it
* do not include architecture theory that belongs in the stable docs

A task doc should be specific enough that another agent can implement it safely with the listed references.

---

## Stable conclusion

`docs/dev/tasks/` exists to make AI-assisted implementation safer and more scalable.

Use:

* stable docs for permanent rules
* task docs for one approved piece of work
* commit plans for implementation slices

Task docs should stay concise, explicit, and operational.

## Task doc is a live implementation record

A task doc is not only a planning document.
Once implementation starts, it also becomes the implementation record for that task.

The implementation agent must update the task doc when reality differs from the original plan.

Examples:
- a file had to be placed in a different location than first proposed
- a naming choice changed after inspecting the real code
- a planned split turned out to be worse than keeping a file together
- an extra supporting change became necessary
- part of the original scope was deferred
- a different commit split turned out to be better
- an architecture constraint from the stable docs forced a different solution

The task doc must stay aligned with the actual implementation approach.
Do not leave the task doc as a stale plan once implementation has diverged.

## Required updates by the implementation agent

If implementation differs from the approved task plan, the implementation agent must update the task doc before marking the task complete.

At minimum, the agent must update:
- `Status`
- `Files expected to change`
- `Proposed implementation` if the actual sequence changed materially
- `Naming` if any approved naming changed
- `Commit plan` if commits were split or merged differently
- `Verification` if additional checks were needed
- `Docs to update`
- `Diagrams to update`

The agent must also add a short note explaining why the plan changed.
Keep this concise and factual.

## Allowed implementation drift

Implementation may diverge from the original task plan only when there is a concrete reason.

Acceptable reasons include:
- the existing code had constraints not visible during planning
- the approved naming conflicted with real repo conventions
- the proposed placement weakened ownership after inspecting related files
- the planned split increased indirection or navigation cost
- a smaller or clearer change achieved the same goal
- an additional required supporting change was discovered

When this happens, the task doc must be updated with:
- what changed
- why it changed
- what was implemented instead

## Do not silently improvise

The implementation agent must not silently:
- widen scope
- rename core concepts
- introduce new architecture
- move canonical types
- create new shared abstractions
- ignore the approved ownership model

If the deviation is structural or architectural, the agent must pause and request human approval before continuing.

If the deviation is local and does not change the approved architecture, the agent may proceed, but must still update the task doc with the actual implementation details.
