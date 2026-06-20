# Changelog

All notable user-facing changes to ani2arr are documented in this file.

## v2.1.0 - Seerr support added

Released: 2026-06-16

### Added

- Added Seerr as an optional request provider.
- Added Seerr request actions on AniList and AniChart.
- Added Seerr status checks for requested, processing, partially available, available, and unavailable media.
- Added Seerr target selection for cases where ani2arr needs a manual TMDB or season target.
- Added Seerr configuration in the options page.
- Added UI options for choosing whether Arr or Seerr is the primary browse-card action.

### Changed

- Updated browse overlays so Sonarr/Radarr and Seerr actions can be used side by side.
- Improved handling of Seerr TV seasons.
- Ignored Seerr seasons with zero episodes.
- Updated README and project metadata for Sonarr, Radarr, and Seerr support.

### Notes

- Sonarr and Radarr still work as before.
- Seerr is optional and only needs to be configured if you want request-based actions.

## v2.0.0 - Radarr support added

Released: 2026-06-06

### Added

- Added Radarr support.
- Added movie handling for AniList entries that should be routed to Radarr.
- Added support for Sonarr and Radarr actions in the same extension workflow.
- Added or improved request management features related to provider actions.

### Changed

- Updated the README for Sonarr and Radarr support.
- Updated project links to open in a new tab where relevant.
- Updated dependency versions through Dependabot.

### Notes

- This version expanded ani2arr from a Sonarr-only extension to a Sonarr and Radarr extension.
- Seerr support was added later in v2.1.0.

## v1.0.1 - First GitHub release

Released: 2026-03-10

### Added

- Added the first GitHub release for ani2arr.
- Added one-click Sonarr integration for AniList and AniChart.
- Added Sonarr actions on AniList anime detail pages.
- Added Sonarr actions on AniList browse/search pages.
- Added Sonarr actions on AniChart browse pages.
- Added AniList to TVDB mapping flow.
- Added mapping caching, throttling, and retry handling.
- Added options UI for Sonarr connection settings.
- Added options UI for Sonarr credentials.
- Added options UI for default Sonarr add settings.
- Added Firefox XPI release asset.

### Notes

- This release was approved for Firefox AMO.
- This version only supported Sonarr.
- Radarr support was added later in v2.0.0.
- Seerr support was added later in v2.1.0.
