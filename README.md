<!-- README overview, install, screenshots, development, and privacy notes for ani2arr. -->
<!-- README.md -->

<p align="center">
  <img src="docs/images/icon.png" alt="ani2arr icon" width="96" height="96">
</p>

<h1 align="center">ani2arr</h1>

<p align="center">
  One-click Sonarr and Radarr actions for AniList and AniChart.
</p>

<p align="center">
  <a href="https://addons.mozilla.org/en-US/firefox/addon/ani2arr/" target="_blank" rel="noopener noreferrer"><img alt="Firefox Add-on" src="https://img.shields.io/badge/Firefox-AMO-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white"></a>
  <a href="https://github.com/infectiousstupidity/ani2arr/releases" target="_blank" rel="noopener noreferrer"><img alt="GitHub release" src="https://img.shields.io/github/v/release/infectiousstupidity/ani2arr?style=for-the-badge&logo=github&label=Release"></a>
  <a href="https://github.com/infectiousstupidity/ani2arr/actions/workflows/ci.yml" target="_blank" rel="noopener noreferrer"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/infectiousstupidity/ani2arr/ci.yml?branch=main&label=CI&style=for-the-badge"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/infectiousstupidity/ani2arr?style=for-the-badge"></a>
</p>

## Table of contents

- [Features](#features)
- [Install](#install)
- [Screenshots](#screenshots)
- [Development](#development)
- [Privacy and permissions](#privacy-and-permissions)
- [Notes](#notes)
- [License](#license)

## Features

- Adds Sonarr and Radarr actions to <a href="https://anilist.co/anime/21/ONE-PIECE/" target="_blank" rel="noopener noreferrer">AniList anime pages</a>, <a href="https://anilist.co/search/anime" target="_blank" rel="noopener noreferrer">AniList browse</a>, and <a href="https://anichart.net" target="_blank" rel="noopener noreferrer">AniChart</a>.
- Routes AniList series to Sonarr and AniList movies to Radarr.
- Uses AniList metadata and public <a href="https://github.com/anibridge/anibridge-mappings" target="_blank" rel="noopener noreferrer">AniBridge mappings</a> to improve matching.
- Supports manual mappings when automatic matching is wrong, missing, or ambiguous.
- Stores settings locally and does not include analytics, advertising, tracking SDKs, or a developer-operated backend.

## Install

| Browser           | Recommended install                                                        | Notes                                             |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| Firefox           | <a href="https://addons.mozilla.org/en-US/firefox/addon/ani2arr/" target="_blank" rel="noopener noreferrer">Firefox Add-ons</a> | Requires Firefox 142 or newer.                    |
| Chrome / Chromium | <a href="https://github.com/infectiousstupidity/ani2arr/releases" target="_blank" rel="noopener noreferrer">GitHub Releases</a> | Download the Chrome MV3 zip and load it unpacked. |

### Manual install

**Firefox XPI**

1. Download the signed XPI from <a href="https://addons.mozilla.org/en-US/firefox/addon/ani2arr/" target="_blank" rel="noopener noreferrer">Firefox Add-ons</a> or <a href="https://github.com/infectiousstupidity/ani2arr/releases" target="_blank" rel="noopener noreferrer">GitHub Releases</a>.
2. Open `about:addons`.
3. Gear menu -> `Install Add-on From File...`.
4. Select the XPI.

**Chrome / Chromium**

1. Download and extract the Chrome MV3 zip from <a href="https://github.com/infectiousstupidity/ani2arr/releases" target="_blank" rel="noopener noreferrer">GitHub Releases</a>.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select the extracted extension folder.

Local Chrome builds are created under `.output/chrome-mv3`.

## Screenshots

| AniList browse                                                                                                                                                                  | AniChart browse                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a href="docs/images/browse-page.png" target="_blank" rel="noopener noreferrer"><img src="docs/images/browse-page.png" alt="ani2arr actions on AniList browse" width="260"></a> | <a href="docs/images/anichart.png" target="_blank" rel="noopener noreferrer"><img src="docs/images/anichart.png" alt="ani2arr actions on AniChart" width="260"></a> |

| Add modal                                                                                                                                                   | Edit modal                                                                                                                                                     | Change mapping modal                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a href="docs/images/modal-add.png" target="_blank" rel="noopener noreferrer"><img src="docs/images/modal-add.png" alt="ani2arr add modal" width="260"></a> | <a href="docs/images/modal-edit.png" target="_blank" rel="noopener noreferrer"><img src="docs/images/modal-edit.png" alt="ani2arr edit modal" width="260"></a> | <a href="docs/images/modal-mapping.png" target="_blank" rel="noopener noreferrer"><img src="docs/images/modal-mapping.png" alt="ani2arr mapping modal" width="260"></a> |

| Provider options                                                                                                                                                                 | Mapping options                                                                                                                                                               | Options UI                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a href="docs/images/options-provider.png" target="_blank" rel="noopener noreferrer"><img src="docs/images/options-provider.png" alt="ani2arr provider options" width="260"></a> | <a href="docs/images/options-mapping.png" target="_blank" rel="noopener noreferrer"><img src="docs/images/options-mapping.png" alt="ani2arr mapping options" width="260"></a> | <a href="docs/images/options-ui.png" target="_blank" rel="noopener noreferrer"><img src="docs/images/options-ui.png" alt="ani2arr options UI" width="260"></a> |

## Development

This project uses pnpm, WXT, React, TypeScript, Tailwind CSS, and Vitest.

### Requirements

- Node.js 24 or newer
- pnpm 11.5.1 or compatible

### Commands

```powershell
pnpm install

pnpm run dev
pnpm run dev:firefox

pnpm run lint
pnpm run compile
pnpm run test

pnpm run build
pnpm run build:firefox

pnpm run zip
pnpm run zip:firefox
```

Build and zip artifacts are created under `.output/`.

## Privacy and permissions

ani2arr stores configuration locally in browser extension storage, including provider URLs, API keys, default add settings, UI preferences, manual mappings, and cached metadata.

ani2arr may request data from configured Sonarr/Radarr servers, AniList GraphQL, and public AniBridge mapping files hosted on GitHub. It does not send data to a developer-owned backend, include analytics, include advertising, include tracking SDKs, sell user data, or sync settings to a developer service.

Browser permissions cover AniList, AniChart, AniList GraphQL, public AniBridge mapping files, and the Sonarr/Radarr provider URL configured by the user. Host permissions are origin-based, and Firefox cannot isolate permissions by port.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Notes

- Thanks to <a href="https://github.com/anibridge/anibridge-mappings" target="_blank" rel="noopener noreferrer">AniBridge</a> and their contributors for maintaining the upstream mapping database.
- This project is not actively maintained. The author is not a formally trained developer; use at your own risk.
- Issues and PRs are welcome.

## License

ani2arr is licensed under the [GNU General Public License v3.0](LICENSE).
