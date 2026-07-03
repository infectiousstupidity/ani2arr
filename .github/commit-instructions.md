# Commit Instructions

Use Conventional Commits.

## Format

```txt
<type>(optional-scope): <description>
```

## Common types

- `feat` - user-facing feature
- `fix` - bug fix
- `docs` - documentation only
- `style` - formatting only
- `refactor` - code change with no behavior change
- `perf` - performance improvement
- `test` - tests only
- `build` - build system or dependency change
- `ci` - CI workflow change
- `chore` - maintenance
- `revert` - revert a previous commit

## Allowed scopes

anilist
background
content
entrypoints
ui
mapping
options
providers
rpc
shared
storage
tooling

## Rules

- Use lowercase type.
- Use imperative mood.
- Keep the subject near 50 characters when possible; hard cap 72.
- Keep the full header under 100 characters. Commitlint enforces this.
- Do not end the subject with a period.
- Use a scope only when it improves clarity.
- Use a one-line commit message by default.
- Add a body only for non-obvious why, breaking changes, migrations, linked
  issues, security fixes, data migrations, or reverts.
- Keep every body and footer line under 100 characters. Commitlint enforces this.
- Wrap body and footer lines at 72 characters.
- Use `-` for body bullets, not `*`.
- Do not generate file-by-file summaries.
- Do not add AI attribution, emoji, "this commit does", "I", "we", "now", or
  "currently".

## Examples

```txt
feat(auth): add login form
fix(api): handle empty response body
chore: update project core tooling
ci: add security scan workflow
```

With a body:

```txt
perf: defer analytics script

Third-party analytics blocks first paint on mobile service pages.
Loading it after hydration keeps the above-the-fold content responsive.
```
