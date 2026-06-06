# General rules

- Caveman mode
- Always run pnpm commands through Windows (e.g cmd.exe /d /s /c "pnpm lint")
- KISS principles
- SOLID principles
- YAGNI principles
- No typescript spaghetti or gymnastics
- No overengineering or premature optimization
- No enterprise patterns or jargon
- No unnecessary abstractions or indirections
- No overuse of design patterns. Use them only when they clearly solve a problem.
- Only add the absolute highest value tests. Don't test implementation details or trivial code. Focus on critical paths and edge case where absolutely necessary. DO NOT TEST USELESS UI STUFF.
- DO NOT use overlapping enums; prefer flat, discriminated unions.
- Read functions must be 100% pure with zero side-effects or silent mutations.
- Code should be dumb, flat, and easy to delete.
- Optimize for simplicity, readability, and a single-user environment.
- DO NOT use enterprise scaling patterns like CQRS, Dependency Injection containers, or materialized views
- No barrel exports

- validate touched files with pnpm lint:target
- run tests for files with pnpm test

- All files must include a header comment with the file location and a brief description of their purpose and any important details.
  -- Example:

```ts
/** RPC handlers for AniList media fetch, search, and metadata flows. */
// src/rpc/handlers/anilist.handlers.ts
```

- For all legacy or temporary compatibility code, add a comment with the prefix `LEGACY:` and a brief explanation of why it exists and when it can be removed.
  -- Example:

```ts
/** LEGACY: Temporary compatibility layer for AniList integration. */
// src/rpc/handlers/anilist.handlers.ts
```

- Avoid these commenting mistakes
  - Stating the obvious: Don't comment what the code clearly shows (e.g., "increment counter" above `i++`)
  - Outdated comments: Remove or update comments when code changes
  - Commented-out code: Use version control instead of leaving old code
  - Excessive comments: If you need many comments, consider refactoring for clarity

# Ownership Rules

Respect folder boundaries.

- `anilist`: AniList IDs, API, metadata, cache.
- `mapping`: AniList ID -> provider ID. Manual, auto, ignored, upstream mappings.
- `providers`: Sonarr/Radarr clients, IDs, metadata, search, library, cache.
- `settings`: Persisted extension settings and provider config.
- `rpc`: Request/response boundary. Combine domain facts into DTOs.
- `queries`: React Query adapters. Cache keys, stale times, invalidations, and UI-facing query/mutation hooks around RPC or local option reads. No provider clients, storage ownership, or background work.
- `background`: Wire services, lifecycle, startup, reset, scheduled refresh.
- `content`: Injected page behavior, DOM parsing, portals, launch snapshots.
- `features`: UI features. Modal, overlay, provider action, mapping UI.
- `options-page`: Options UI only.
- `shared`: Generic utilities only. No domain knowledge.

Good flow:

```text
features/options-page/content
  -> queries
  -> rpc
  -> mapping.resolve(anilistId, provider)
  -> providers/library.check(providerId)
  -> response DTO
```

Forbidden:

```text
providers/library -> mapping
providers/library -> rpc
mapping -> providers/library
shared -> domain folders
features -> provider clients/storage
queries -> provider clients/storage
```

If a file answers more than one domain question, split or move it.
