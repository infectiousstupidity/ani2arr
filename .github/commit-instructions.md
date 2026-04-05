Use Conventional Commits.

Format:
type(scope): summary

Allowed types:
feat
fix
refactor
docs
test
chore
perf
build
ci
style
revert

Allowed scopes:
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

Rules:
- Use exactly: type(scope): summary
- Use an allowed type
- Use an allowed scope when clear from the diff
- Use imperative mood
- Keep the first line at 72 characters or less
- Be specific about the affected subsystem
- Avoid vague summaries like "update", "changes", or "cleanup"

Examples:
- refactor(providers): simplify options status flow
- fix(mapping): handle missing AniList relation IDs
- docs(shared): tighten verification guidance
- test(storage): cover revision invalidation behavior
