# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

Tests are extremely expensive as a solo hobby developer - so only implement the highest value tests.

For refactors, first look for code that can be deleted, merged, or inlined.
Do not start by extracting new layers.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Output style: visual-first, token-tight

For all non-trivial outputs, prefer compact ASCII diagrams before prose.

Use diagrams when the response involves:

- codebase review
- implementation plans
- architecture
- data flow
- state ownership
- storage/cache/invalidation
- UI/component structure
- bug causes
- refactors
- proposal comparisons
- tradeoffs

Default structure:

1. ASCII diagram
2. Short explanation
3. Recommendation or plan
4. Files/components affected
5. Risks/checks

Keep output concise:

- no filler
- no motivational language
- no repeated summaries
- no long introductions
- no obvious restatements
- no giant diagrams when a small one works
- no prose wall before the diagram

Do not use full caveman style. Use clear technical English. Fragments are allowed only when they improve readability.

Prefer concrete value-trace diagrams over abstract architecture diagrams.

Good targets:

- where a value starts
- where it is validated
- where it is stored/cached
- where it is passed
- where it is used as a key
- where it is transformed
- what UI/behavior it affects
- what can refresh
- what can reset
- who owns it

Avoid abstract phrases unless immediately grounded:

- "source of truth"
- "derived state"
- "form identity"
- "local ownership"
- "controller"
- "invalidation"
- "abstraction boundary"

When using one of those phrases, include:

- concrete value
- concrete file/hook/component
- what changes it
- what breaks if it changes incorrectly

Example:

```text
+----------------------+
| AniListId extracted  |
| from page/card       |
+----------+-----------+
           |
           v
+----------------------+
| Parsed/validated     |
| as AniListId         |
+----------+-----------+
           |
           +-------------------+
           |                   |
           v                   v
+------------------+  +------------------+
| Mapping lookup   |  | Metadata query   |
+--------+---------+  +------------------+
         |
         v
+------------------+
| Provider ID      |
| TVDB/TMDB        |
+--------+---------+
         |
         v
+------------------+
| Provider status  |
| Sonarr/Radarr    |
+--------+---------+
         |
         v
+------------------+
| Modal behavior   |
+------------------+
```
