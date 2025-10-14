# Kitsunarr Agents Guide

## 1. Project Snapshot
- Kitsunarr adds Sonarr integration to AniList pages via a WXT browser extension targeting Chromium and Firefox.
- Core stack: TypeScript (strict), React 19, TanStack Query 5, Radix UI primitives, Tailwind CSS 4, WebExtension APIs via `wxt`.
- Services rely on `@webext-core/proxy-service` for background/foreground RPC, `@wxt-dev/storage` for local-only storage, `idb-keyval` for query caching.
- Domain: map AniList anime -> TVDB -> Sonarr library, allowing quick add with customizable defaults.

## 2. Tooling & Commands
- `npm install` seeds deps and runs `wxt prepare` via `postinstall`.
- `npm run dev` (or `npm run dev:firefox`) launches the WXT dev server with fast reload.
- `npm run build` produces a production bundle in `dist`; `npm run zip` creates distributable archives.
- `npm run lint` uses ESLint 9 with TypeScript config; keep it passing.
- Type-check with `npm run compile`; run tests with `npm test` or `npx vitest`.
- `npm run test:contract` exercises the KitsunarrApi RPC contract in a Node.js environment with mocked browser APIs (storage, runtime, alarms) and fetch handlers for Sonarr/AniList/mapping endpoints. It validates method signatures, response schemas, error handling, message broadcasting (settings-changed, series-updated), storage events, epoch management, and concurrent request deduplication. Run this after API changes to ensure background service contract stability.
- `npm run test:e2e` runs Playwright end-to-end tests against a real browser with the extension loaded and a mock Sonarr server. These tests validate the full user journey from options configuration through series addition on AniList pages.

## 3. Architecture Overview
### Entry points (`src/entrypoints`)
- `background/index.ts` registers proxy services via [`registerKitsunarrApi()`](src/services/index.ts), seeds mapping caches on install/start using [`initMappings()`](src/services/index.ts), handles periodic mapping refreshes via browser alarms (or setInterval fallback in MV2), and processes cross-context messages (OPEN_OPTIONS_PAGE, match:score-batch, mapping:refresh).
- `options/index.tsx` renders the settings page ([`SettingsForm`](src/ui/SettingsForm.tsx)) under `options/index.html` with TanStack Query provider and Radix TooltipProvider.
- `popup/index.tsx` shows a lightweight status/shortcut UI when the toolbar icon is opened (currently excluded from Chrome/Firefox via manifest).
- `anilist-anime.content/index.tsx` injects the main action group ([`SonarrActionGroup`](src/ui/SonarrActionGroup.tsx)) on AniList anime detail pages, hydrating TanStack Query with an IndexedDB persister and mounting UI into shadow DOM via `createShadowRootUi`.
- `anilist-browse.content/index.tsx` handles AniList list/grid views using [`BrowseOverlay`](src/ui/BrowseOverlay.tsx) adapter pattern, rendering action buttons on media cards with MutationObserver-based card scanning.
- `anichart-browse.content/index.tsx` provides AniChart.net integration using the same BrowseOverlay system with site-specific selectors.

### Shared services (`src/services`)
- `index.ts` exposes [`registerKitsunarrApi()`](src/services/index.ts) / [`getKitsunarrApi()`](src/services/index.ts) using `@webext-core/proxy-service`; every consumer must assume RPC semantics (async, serialized, cross-context). The API handles epoch bumping (libraryEpoch, settingsEpoch) and broadcasts runtime messages (`_kitsunarr: true`) for cache invalidation.
- [`library.service.ts`](src/services/library.service.ts) maintains a lean Sonarr series cache (TVDB-indexed) with soft TTL (1h) / hard TTL (24h) and derives status for AniList IDs via mapping resolution. Errors are cached separately (5min TTL) to avoid repeated failures.
- [`mapping.service.ts`](src/services/mapping.service.ts) orchestrates `StaticMappingProvider` (static payloads), `SonarrLookupClient` (Sonarr lookups + positive/negative TTL caches), and the search-term generator to resolve AniList IDs; successes/failures are cached with scoped TTL constants per collaborator.
- [`src/cache/ttl-cache.ts`](src/cache/ttl-cache.ts) exposes stale-while-revalidate TTL caches persisted in IndexedDB only (no process-level shadow cache); expect asynchronous reads and rely on each service's in-memory indexes when hot-path speed is required.

### Hooks & State (`src/hooks`)
- [`use-api-queries.ts`](src/hooks/use-api-queries.ts) centralizes TanStack Query keys under `queryKeys` object, provides hooks for options/metadata/status fetches, and exposes mutations for add/test/save flows with optimistic updates and error handling.
- [`use-broadcasts.ts`](src/hooks/use-broadcasts.ts) listens for `browser.runtime.onMessage` events with `_kitsunarr: true` flag, invalidating TanStack Query caches on `series-updated` and `settings-changed` topics while syncing epoch values to sessionStorage.
- [`use-settings-manager.ts`](src/hooks/use-settings-manager.ts) orchestrates the options form with dirty tracking, connection testing, metadata hydration (quality profiles, root folders, tags), and coordinated save/reset flows.
- [`use-add-series-manager.ts`](src/hooks/use-add-series-manager.ts) and [`use-theme.ts`](src/hooks/use-theme.ts) provide focused UI helpers (add form state, AniList theme sync).

## 4. Domain Model & Data Flow
- Types live in [`src/types.ts`](src/types.ts); key shapes include `ExtensionOptions` (stored in local storage), `SonarrFormState`, `AddRequestPayload`, and `CheckSeriesStatusResponse`. RPC schemas in [`src/rpc/schemas.ts`](src/rpc/schemas.ts) define the public API surface.
- Settings flow: options UI → [`use-settings-manager`](src/hooks/use-settings-manager.ts) → [`extensionOptions`](src/utils/storage.ts) storage item (local-only) → background services receive updated credentials via `notifySettingsChanged()` → `settingsEpoch` bump → broadcast triggers cache clear in all contexts.
- **Security note**: All settings (including Sonarr credentials) are stored in `browser.storage.local` (device-only) to prevent API keys from being synced to browser cloud accounts. User defaults are hydrated from Sonarr metadata on connection, so cross-device sync is unnecessary.
- Content flow: AniList content script → [`library.getSeriesStatus()`](src/services/library.service.ts) (with optional `force_verify`, `network: 'never'` flags) → mapping resolution via [`mapping.resolveTvdbId()`](src/services/mapping.service.ts) → Sonarr lookup if needed → [`sonarr.addSeries()`](src/api/sonarr.api.ts) on user action → `libraryEpoch` bump → broadcast triggers status query invalidation.
- Permissions: Sonarr host access is requested on-demand via [`requestSonarrPermission()`](src/utils/validation.ts) when testConnection or API calls require it; every outbound fetch verifies with [`hasSonarrPermission()`](src/utils/validation.ts) before proceeding.

## 5. Key Modules At A Glance
- [`src/api/sonarr.api.ts`](src/api/sonarr.api.ts): wraps Sonarr v3 endpoints (series, lookup, rootfolder, qualityprofile, tag, system/status) with exponential backoff retry (max 3 attempts), permission checks, rate limit handling (429 with Retry-After), and [`ExtensionError`](src/utils/error-handling.tsx) normalization.
- [`src/api/anilist.api.ts`](src/api/anilist.api.ts): fetches AniList GraphQL metadata with request deduplication (inflight map), batched queue processing (2 requests per 1.2s batch), and multi-level relation traversal (up to 3 hops) for synonym/parent resolution.
- [`src/ui/Form.tsx`](src/ui/Form.tsx): shared form primitives using Radix Context pattern with Tailwind styling, providing FormField/FormItem/FormLabel/FormControl/FormMessage components with automatic ID wiring via `useFormField()`.
- [`src/ui/SonarrActionGroup.tsx`](src/ui/SonarrActionGroup.tsx): renders the injected button group with status-dependent UI (loading, in Sonarr, not found, error), handling quick-add clicks, modal launches, and external Sonarr/search links.
- [`src/ui/Form.tsx`](src/ui/Form.tsx): exports Radix Select primitives, including `SelectContent` that accepts a `container` prop to render inside the shadow DOM. Callers like [`src/ui/SonarrForm.tsx`](src/ui/SonarrForm.tsx) pass a `portalContainer` through so dropdowns mount within the shadow root instead of `document.body`.
- [`src/ui/BrowseOverlay.tsx`](src/ui/BrowseOverlay.tsx): adapter-based browse integration system using MutationObserver to scan for media cards, parse metadata from DOM attributes, inject action buttons via React portals into shadow DOM, and respond to wxt:locationchange events.
- [`src/utils/error-handling.tsx`](src/utils/error-handling.tsx): defines [`ExtensionError`](src/utils/error-handling.tsx) class with `ErrorCode` enum (config, permission, network, sonarr, anilist, mapping, unknown), factory helpers (`createConfigError`, `createPermissionError`, etc.), [`normalizeError()`](src/utils/error-handling.tsx) for unknown error conversion, and React ErrorBoundary component.
- [`src/utils/retry.ts`](src/utils/retry.ts): exponential backoff with jitter (`withRetry()` wrapper) supporting max retries, custom backoff multipliers, and typed error handling; avoid writing bespoke retry loops.
- [`src/cache/query-cache.ts`](src/cache/query-cache.ts): TanStack Query persister using `idb-keyval` with key `kitsunarr:tanstack-query` for persistent cache across page reloads. Filters out credential-bearing queries (options) to prevent API key leakage into page-origin IndexedDB.
- [`wxt.config.ts`](wxt.config.ts): single source of truth for manifest data (name, description, permissions split by MV2/MV3), entry points, @tailwindcss/vite plugin, source maps configuration, and required/optional host permissions.

## 6. Patterns & Conventions
- Use the `@/*` path alias (configured in [`tsconfig.json`](tsconfig.json)) instead of relative traversals.
- Stick to functional React components with `React.memo` / `React.forwardRef` when creating reusable primitives; avoid class components.
- TanStack Query keys live in `queryKeys` object in [`use-api-queries.ts`](src/hooks/use-api-queries.ts); reuse them to avoid accidental cache fragmentation and ensure broadcasts invalidate correctly.
- Always wrap cross-context service calls in `try/catch` and pass errors through [`normalizeError()`](src/utils/error-handling.tsx) so UI can present `userMessage` via toast/alert.
- Prefer pure helpers in `utils/` and keep side effects (storage, fetches, cache writes) inside services or hooks.
- Tailwind utility classes drive styling; co-locate component-specific `.css` only when shadow DOM isolation or global overrides (injected via `cssInjectionMode: 'ui'`) are required.
- Logging goes through [`logger.create(scope)`](src/utils/logger.ts) to honor build-time log level gating and consistent prefixes.

## 7. Caching & Resilience
- `createTtlCache` entries store both `staleAt` (soft TTL) and `expiresAt` (hard TTL); stale data is returned while background refresh runs. With the in-memory shim removed, every read hits IndexedDB—make sure callers that need instantaneous responses maintain their own lightweight mirrors (e.g., `StaticMappingProvider` maps, library indexes).
- Persistent cache namespaces are centralized in `src/cache/namespaces.ts` via `CacheNamespaces`. Always pass one of these constants to `createTtlCache(...)` instead of a string literal to avoid drift and make audits easy.
- Mapping resolution caches successes (30d soft / 180d hard TTL) and categorized failures: config/permission errors (30min), network errors (5min). Use the categorized TTL helpers to avoid hammering third parties during outages.
- TanStack Query persistence (via [`queryPersister`](src/cache/query-cache.ts)) keeps AniList page state snappy across navigations; invalidate via `queryClient.invalidateQueries({ queryKey })` with matching keys after mutations or epoch bumps.
- Error caches prevent retry storms: [`library.service.ts`](src/services/library.service.ts) caches API failures for 5min, [`mapping.service.ts`](src/services/mapping.service.ts) caches by error category, [`anilist.api.ts`](src/api/anilist.api.ts) uses inflight deduplication to prevent duplicate GraphQL queries.

## 8. UI System Notes
- Shadow DOM constraints: content scripts mount UIs via `createShadowRootUi({ cssInjectionMode: 'ui' })`. When building new portals (Radix Select, Dialog, Tooltip), pass `portalContainer` and have consumers render Radix selects via the exported `SelectContent` from [`Form.tsx`](src/ui/Form.tsx) with its `container` prop so content renders inside the shadow root instead of `document.body`.
- Forms rely on `FormField` context (from [`Form.tsx`](src/ui/Form.tsx)) to link labels/inputs via `useFormField()` hook; avoid breaking the context contract or accessibility will degrade.
- Tooltips, dialogs, selects, and accordion components come from Radix UI; style through Tailwind utility classes applied to the composed primitives (Trigger, Content, Portal, etc.).
- Browse overlays use MutationObserver with `childList: true, subtree: true, attributes: true` to detect card additions/updates. Throttle scans and use `data-kitsunarr-processed` attribute to prevent duplicate processing.

## 9. Testing & Validation
- Lint before committing (`npm run lint`); ESLint is strict about React hooks rules, exhaustive deps, unused vars, and import ordering.
- Use `npm run compile` to ensure the TypeScript project (including partner tsconfigs under `.wxt/`) stays error-free across all entry points.
- For runtime verification, run `npm run dev`, load `.output/chrome-mv3` via browser extensions page, and exercise AniList anime pages, browse views, and options page.
- Unit tests (`npx vitest`) use Vitest with MSW for API mocking, `fake-indexeddb` for storage, and `fakeBrowser` from `wxt/testing` for WebExtension APIs. See [`vitest.setup.jsdom.ts`](vitest.setup.jsdom.ts) and [`vitest.setup.node.ts`](vitest.setup.node.ts) for global setup.
- Contract test (`npm run test:contract`) validates the KitsunarrApi RPC surface in isolation with comprehensive error handling, broadcasting, and schema validation. For coverage details and scenarios, refer to inline docs in `scripts/test-contract.ts` and the assertions within that suite.
- E2E tests (`npm run test:e2e`) use Playwright with real Chromium/Firefox browsers, loaded extension, and mock HTTP server to validate full user workflows from options setup through series addition.

## 10. Operational Tips & Pitfalls
- New hosts require manifest updates in [`wxt.config.ts`](wxt.config.ts) under `host_permissions` (MV3) or `permissions` (MV2) and may also need runtime permission prompts via [`requestSonarrPermission()`](src/utils/validation.ts).
- Background alarms (`browser.alarms`) do not fire reliably in MV2 on Chromium when the background page is suspended; [`background/index.ts`](src/entrypoints/background/index.ts) falls back to `setInterval` via a global guard (`__kitsunarr_fallback_interval__`).
- [`registerKitsunarrApi()`](src/services/index.ts) must execute exactly once (in background context). Content scripts and options pages should only ever call [`getKitsunarrApi()`](src/services/index.ts) to access the proxy client.
- Respect rate limits: AniList GraphQL batching is enforced via `AnilistApiService`'s `PQueue` (2 requests per 1.2s window). Sonarr lookups rely on `SonarrLookupClient` for inflight dedupe plus positive/negative TTL caches—there is no internal queue anymore, so throttle at the caller before introducing new bursty flows.
- Keep AGENTS.md in sync when adding core flows, changing service contracts, or modifying RPC schemas so future agents (human or AI) stay aligned with actual behavior.
- Long-running tooling (tests, docker compose, migrations, etc.) must always be invoked with sensible timeouts or in non-interactive batch mode. Never leave a shell command waiting indefinitely—prefer explicit timeouts, scripted runs, or log polling after the command exits.

## 11. Testing Conventions
- Vitest is configured via [`vitest.setup.jsdom.ts`](vitest.setup.jsdom.ts) (for UI tests with React Testing Library) and [`vitest.setup.node.ts`](vitest.setup.node.ts) (for service/API tests). Global setup includes MSW server start, `fakeBrowser` initialization, and `fake-indexeddb` polyfill.
- Import fixtures and MSW helpers from [`@/testing`](src/testing/index.ts). [`defaultTestHandlers`](src/testing/msw-server.ts) cover AniList, Sonarr, and mapping mirrors with typed data; tweak responses using helpers like `withLatency`, `withStatus`, `withEtag`, and `withRetryAfterSeconds`.
- Prefer MSW over manual `fetch` mocks so retry/backoff utilities exercise real timing. Reset handlers with `testServer.resetHandlers()` (already done in global `afterEach`).
- When mocking modules, use `vi.mock()` inside test files and let [`vitest.setup.*.ts`](vitest.setup.node.ts) handle cleanup (`vi.resetModules`, `vi.clearAllMocks`). Avoid mutating `fakeBrowser` directly—call `fakeBrowser.reset()` or storage/runtime reset helpers between assertions if additional isolation is required.
- Store new fixtures under [`src/testing/fixtures`](src/testing/fixtures/index.ts) to keep API payload shapes centralized and reusable across unit/integration/contract tests.
- E2E tests follow the Page Object Model pattern (see [`tests/e2e/pages`](tests/e2e/pages/options-page.ts)) and use a shared mock HTTP server (`tests/e2e/server.ts`) that provides both AniList and Sonarr endpoints with stateful series management.

## 12. Contract vs E2E Testing
- **Contract tests** ([`scripts/test-contract.ts`](scripts/test-contract.ts)) validate the KitsunarrApi RPC boundary in **Node.js** with mocked browser APIs (no real browser). They ensure method signatures, response schemas, error handling, broadcasting, and epoch management remain stable across refactors. Run these during development to catch breaking changes early.
- **E2E tests** ([`tests/e2e/extension.spec.ts`](tests/e2e/extension.spec.ts)) validate the **full user journey** in **real Chromium/Firefox** with the extension loaded. They test DOM interactions, content script injection, shadow DOM rendering, options page workflows, and cross-context messaging. Run these before releases to catch integration issues.
- Both test types are **complementary**: contract tests are fast (seconds) and catch API breaks; E2E tests are slow (minutes) but validate real-world behavior. Keep both green.
