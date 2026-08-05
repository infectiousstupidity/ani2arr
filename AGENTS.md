# Ani2arr Agent Notes

Use global base skills when relevant.

## Project Shape

Ani2arr is a WXT browser extension for AniList/AniChart pages with Sonarr, Radarr, and Seerr integration.

Relevant skills:

- `wxt-browser-extension` for extension runtime, entrypoints, storage, messaging, manifest, and content-script work.
- `react-best-practices` for React UI work.
- `boring-architecture` for boundary or data-flow changes.
- `security-scanning` for audit, Gitleaks, Semgrep, or dependency security work.
- `simplicity-review` for code, folder, architecture, and plan simplification.
- `Context7` for up to date dependency and API docs. Do not rely on your training data.

## Commands

- Lint touched files: `pnpm lint:target <files>`
- Run focused tests: `pnpm test <files-or-patterns>`
- Full validation when broad behavior changes: `pnpm validate`

## Code Rules

- Prefer KISS and YAGNI. Do not add speculative abstractions.
- A concise purpose comment is acceptable where useful.
- Do not require duplicated file-path comments or comments that restate obvious code.
- Mark temporary compatibility code with `LEGACY:` and the removal condition.
- No barrel exports.
- Read functions must be pure: no side effects, no silent mutation.
- Do not persist derived UI state.
- Prefer flat discriminated unions over overlapping enums.
- Keep tests focused on behavior with meaningful regression risk.

## Ownership

Respect folder ownership:

- `anilist`: AniList IDs, API, metadata, cache.
- `myanimelist`: MyAnimeList IDs, API, metadata, cache.
- `mapping`: AniList ID to provider ID mappings.
- `providers`: Sonarr, Radarr, Seerr clients, IDs, metadata, search, library, cache.
- `settings`: persisted extension settings and provider config.
- `rpc`: request/response boundary and DTO composition.
- `queries`: React Query hooks around RPC/local option reads only.
- `background`: service wiring, lifecycle, startup, reset, scheduled refresh.
- `content`: injected page behavior, DOM parsing, portals, launch snapshots.
- `features`: modal, overlay, provider actions, mapping UI.
- `options-page`: options UI only.
- `shared`: generic utilities only. No domain knowledge.

Allowed flow:

features/options-page/content -> queries -> rpc
rpc/background composes mapping and provider services
mapping may import provider identity types only

Forbidden flow:

providers must not call mapping services or rpc
queries must not call provider clients or storage
shared must not import domain folders

If one file answers multiple domain questions, split or move it.
