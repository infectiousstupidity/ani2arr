# Ani2arr Agent Notes

Use global base skills when relevant.

## Project Shape

Ani2arr is a WXT browser extension for AniList/AniChart pages with Sonarr, Radarr, and Seerr integration.

Relevant skills:

- `caveman` always
- `wxt-browser-extension` for extension runtime, entrypoints, storage, messaging, manifest, and content-script work.
- `react-best-practices` for React UI work.
- `boring-architecture` for boundary or data-flow changes.
- `security-scanning` for audit, Gitleaks, Semgrep, or dependency security work.
- `simplicity-review` for code, folder, architecture, and plan simplification.
- `find-docs` for up to date dependency and API docs. Do not rely on your training data.

## Commands

- Lint touched files: `pnpm lint:target <files>`
- Run focused tests: `pnpm test <files-or-patterns>`
- Full validation when broad behavior changes: `pnpm validate`

## Code Rules

- New or touched code files need the standard header:
  ```ts
  /** RPC handlers for AniList media fetch, search, and metadata flows. */
  // src/rpc/handlers/anilist.handlers.ts
  ```
- Mark temporary compatibility code with `LEGACY:` and the removal condition.
- No barrel exports.
- Read functions must be pure: no side effects, no silent mutation.
- Prefer flat discriminated unions over overlapping enums.

## Ownership

Respect folder ownership:

- `anilist`: AniList IDs, API, metadata, cache.
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

```text
features/options-page/content
  -> queries
  -> rpc
  -> mapping
  -> providers
```

Forbidden flow:

```text
providers -> mapping/rpc
mapping -> providers
features -> provider clients/storage
queries -> provider clients/storage
shared -> domain folders
```

If one file answers multiple domain questions, split or move it.
