# Kitsunarr

![Kitsunarr banner](docs/images/banner.png)

<p align="center">Kitsunarr adds one-click Sonarr integration to AniList and AniChart. It maps AniList entries to Sonarr series and pushes them into your library.</p>

## Key features
- Injects Sonarr actions on AniList anime pages, AniList browse views, and AniChart
- Resolves AniList → TVDB mappings with cached lookups, throttled requests, and retry handling
- Options UI to configure Sonarr credentials and default add options

## Quick links
- `wxt.config.ts` - manifest & host permissions
- `src/utils/validation.ts` - runtime permission checks
- `scripts/test-contract.ts` - RPC contract verification

## Quick install (recommended)
- Firefox (AMO-signed): install from Mozilla Add‑ons (AMO) when a signed release is available.
- GitHub releases: download the provided artifact for your browser.

### Compatibility
- Firefox: MV2 / XPI (AMO-signed or local XPI)
- Chrome / Chromium: MV3 (zip / unpack `.output/chrome-mv3`)

### 1. Manual install (from GitHub release / local build)
- Firefox (XPI):
  1. Download the XPI from Releases (or build + zip).
  2. In Firefox, open about:addons → Gear → "Install Add‑on From File..." and select the XPI.
- Chrome / Chromium (MV3):
  1. Download and extract the zip for Chrome MV3 (or build locally).
  2. Open chrome://extensions, enable Developer mode, click "Load unpacked" and select the extracted folder (point at the folder that contains the extension manifest).
  3. Alternatively use the produced folder: [.output/chrome-mv3](.output/chrome-mv3).

### 2. Local build (for developers / side‑loads)
Artifacts are produced under `.output/` after build/zip.

Developer commands (PowerShell)
```powershell
# install deps
npm install

# dev (fast reload)
npm run dev

# build + create zip artifacts
npm run build
npm run zip
# firefox XPI: npm run zip:firefox
```

## Testing
- Unit & integration: npm test
- RPC contract verification (Node): npm run test:contract - see [`scripts/test-contract.ts`](scripts/test-contract.ts)

## Security & privacy
- Sonarr credentials are stored in browser.storage.local (device only). See [`src/utils/validation.ts`](src/utils/validation.ts) for runtime permission checks.
- Host permissions are defined in [`wxt.config.ts`](wxt.config.ts). Be explicit when granting host access.

## Maintenance
- Not actively maintained. The author is not a formally trained developer - use at your own risk.
- Please open issues or PRs if you find problems or want to contribute.