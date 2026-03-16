<p align="center">
  <img src="docs/images/icon.png" alt="ani2arr icon" width="96" height="96">
</p>

<p align="center">ani2arr adds one-click Sonarr and Radarr integration to AniList and AniChart. It maps AniList series to Sonarr, AniList movies to Radarr, and pushes them into your library.</p>

<p align="center">
  <a href="https://addons.mozilla.org/en-US/firefox/addon/ani2arr/">
    <img src="https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white&labelColor=1f2328&color=1f2328" alt="Firefox">
  </a>
  <a href="https://chrome.google.com/webstore/detail/your-extension-id">
    <img src="https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white&labelColor=1f2328&color=1f2328" alt="Chrome">
  </a>
  <a href="https://github.com/infectiousstupidity/ani2arr/releases">
    <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white&labelColor=1f2328&color=1f2328" alt="GitHub">
  </a>
</p>


<h1 align="center">ani2arr</h1>
<br><br>
<p align="center">
  <img src="docs/images/banner.png" alt="ani2arr banner">
</p>


## Key features
- Injects Sonarr and Radarr actions on AniList anime pages, AniList browse views, and AniChart
- Routes AniList series to Sonarr and AniList movies to Radarr
- Resolves AniList mappings with cached lookups, throttled requests, and retry handling
- Options UI to configure Sonarr and Radarr credentials and provider-specific default add options

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
- Sonarr and Radarr credentials are stored in `browser.storage.local` on the user's device. See [`src/shared/arr/validation.ts`](src/shared/arr/validation.ts) for shared runtime permission checks.
- The extension does not use a developer-operated backend or analytics service.
- Firefox host access is requested for the exact Sonarr or Radarr origin the user enters in settings. Broad optional host patterns are declared only so Firefox can grant those user-chosen origins at runtime.
- See [`PRIVACY.md`](PRIVACY.md) for the user-facing privacy policy.

## Maintenance
- Not actively maintained. The author is not a formally trained developer - use at your own risk.
- Please open issues or PRs if you find problems or want to contribute.
