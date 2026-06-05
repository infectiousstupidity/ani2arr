<!-- Public privacy policy for ani2arr data storage, transmission, and permissions. -->
<!-- PRIVACY.md -->

# ani2arr Privacy Policy

Last updated: June 5, 2026

## Summary

ani2arr does not collect, sell, or transmit user data to the developer.

The extension connects AniList and AniChart pages to the user's own self-hosted Sonarr and Radarr servers. To do that, it stores configuration locally in the browser and sends limited request data to external services that are necessary for the feature to work.

## What ani2arr stores locally

ani2arr stores the following data in the browser's local extension storage on the user's device:

- Sonarr and Radarr URLs entered by the user
- Sonarr and Radarr API keys entered by the user
- Sonarr and Radarr default add settings selected by the user
- UI preferences and mapping overrides created by the user
- Cached AniList metadata and mapping data used to reduce repeated lookups

This data is not sent to the developer.

## What ani2arr transmits

ani2arr may transmit data to the following destinations:

### 1. The user's configured Sonarr and Radarr servers

ani2arr sends requests to the exact Sonarr and Radarr URLs entered by the user in the extension settings. These requests are used to:

- test Sonarr and Radarr connections
- read quality profiles, root folders, tags, and library state
- search for series or movie matches using AniList-derived lookup terms
- add or update series in Sonarr or movies in Radarr

Requests to Sonarr or Radarr may include:

- the relevant Sonarr or Radarr API key entered by the user
- AniList-derived identifiers such as AniList IDs, TVDB IDs, and TMDB IDs
- lookup/search terms derived from AniList titles, years, synonyms, and mapping information needed to find the correct series or movie
- Sonarr or Radarr add or update settings chosen by the user

Responses from Sonarr or Radarr may include local provider data used by ani2arr, such as library titles and statuses, root folders, quality profiles, tags, and search candidates. The content UI on AniList and AniChart pages may show related provider status, matched provider titles, saved default add settings, form choices, tags, and search candidates.

If the user configures a provider URL that starts with `http://`, the provider API key is sent over cleartext HTTP to that configured host. ani2arr supports HTTP for localhost and trusted LAN setups, but HTTPS is recommended for any provider exposed beyond a trusted local network.

### 2. AniList GraphQL

ani2arr sends AniList IDs and related query parameters to `https://graphql.anilist.co` to fetch media metadata used for matching and display.

### 3. Public mapping files hosted on GitHub

ani2arr fetches public JSON mapping files from `https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json` to improve AniList-to-TVDB and AniList-to-TMDB matching quality. GitHub may serve those release downloads through `release-assets.githubusercontent.com`.

## What ani2arr does not do

ani2arr does not:

- send data to a developer-owned backend
- include analytics, advertising, or tracking SDKs
- sell user data
- sync settings to a developer service

## Permissions

ani2arr declares broad optional host patterns so Firefox can request permission for the configured self-hosted provider scheme and host at runtime.

The extension does not automatically gain access to every host covered by those optional patterns. Instead, it requests access only to the configured scheme and host. Browser host permissions do not isolate by subfolder, and Firefox cannot isolate by port; API requests still use the exact configured URL.

When the user changes or clears a configured provider URL, ani2arr attempts to remove the previous host permission.

## User control

Users can control data use by:

- choosing whether to configure Sonarr or Radarr at all
- changing or removing the saved Sonarr or Radarr URL and API key
- disconnecting Sonarr or Radarr from the extension
- removing the extension and its stored local data through the browser

## Contact

Questions about this policy can be directed to the contact address used for the extension listing and repository.
