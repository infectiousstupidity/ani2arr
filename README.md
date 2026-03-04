# ani2arr

<p align="center">
  <img src="docs/images/banner.png" alt="ani2arr banner">
</p>

<p align="center">ani2arr adds one-click Sonarr integration to AniList and AniChart. It maps AniList entries to Sonarr series and pushes them into your library.</p>

## Key features
- Injects Sonarr actions on AniList anime pages, AniList browse views, and AniChart
- Resolves AniList → TVDB mappings with cached lookups, throttled requests, and retry handling
- Options UI to configure Sonarr credentials and default add options

## Install
- Firefox (recommended): [Install from AMO](https://addons.mozilla.org/en-US/firefox/addon/ani2arr/)
- GitHub releases: download the published artifact for your browser when a release is available

### Compatibility
- Firefox: MV2 / XPI (AMO-signed or local XPI)
- Chrome / Chromium: MV3 (zip / unpack `.output/chrome-mv3`)

### Manual install
- Firefox (XPI):
  1. Download the signed XPI from Releases or AMO.
  2. In Firefox, open about:addons → Gear → "Install Add‑on From File..." and select the XPI.
- Chrome / Chromium (MV3):
  1. Download and extract the zip for Chrome MV3 (or build locally).
  2. Open chrome://extensions, enable Developer mode, click "Load unpacked" and select the extracted folder (point at the folder that contains the extension manifest).
  3. Alternatively use the produced folder: [.output/chrome-mv3](.output/chrome-mv3).

## Development
Artifacts are produced under `.output/` after build/zip.

Developer commands (PowerShell)
```powershell
# install deps
pnpm install

# dev
pnpm run dev
pnpm run dev:firefox

# validate
pnpm run lint
pnpm run build
pnpm run build:firefox

# create packaged artifacts
pnpm run zip
pnpm run zip:firefox
```

## Security & privacy
- Sonarr credentials are stored in `browser.storage.local` on the user's device. See [`src/shared/sonarr/validation.ts`](src/shared/sonarr/validation.ts) for runtime permission checks.
- The extension does not use a developer-operated backend or analytics service.
- Firefox host access is requested for the exact Sonarr origin the user enters in settings. Broad optional host patterns are declared only so Firefox can grant that user-chosen origin at runtime.
- See [`PRIVACY.md`](PRIVACY.md) for the user-facing privacy policy.

## Maintenance
- Not actively maintained. The author is not a formally trained developer - use at your own risk.
- Please open issues or PRs if you find problems or want to contribute.
