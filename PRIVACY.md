# ani2arr Privacy Policy

Last updated: March 2, 2026

## Summary

ani2arr does not collect, sell, or transmit user data to the developer.

The extension connects AniList and AniChart pages to the user's own self-hosted Sonarr server. To do that, it stores configuration locally in the browser and sends limited request data to external services that are necessary for the feature to work.

## What ani2arr stores locally

ani2arr stores the following data in the browser's local extension storage on the user's device:

- Sonarr URL entered by the user
- Sonarr API key entered by the user
- Sonarr default add settings selected by the user
- UI preferences and mapping overrides created by the user
- Cached AniList metadata and mapping data used to reduce repeated lookups

This data is not sent to the developer.

## What ani2arr transmits

ani2arr may transmit data to the following destinations:

### 1. The user's configured Sonarr server

ani2arr sends requests to the exact Sonarr origin entered by the user in the extension settings. These requests are used to:

- test the Sonarr connection
- read quality profiles, root folders, tags, and library state
- search for series matches
- add or update series in Sonarr

Requests to Sonarr may include:

- the Sonarr API key entered by the user
- AniList-derived identifiers such as AniList IDs and TVDB IDs
- AniList-derived title, year, synonym, and mapping information needed to find the correct series
- Sonarr add or update settings chosen by the user

### 2. AniList GraphQL

ani2arr sends AniList IDs and related query parameters to `https://graphql.anilist.co` to fetch media metadata used for matching and display.

### 3. Public mapping files hosted on GitHub

ani2arr fetches public JSON mapping files from `raw.githubusercontent.com` to improve AniList-to-TVDB matching quality.

## What ani2arr does not do

ani2arr does not:

- send data to a developer-owned backend
- include analytics, advertising, or tracking SDKs
- sell user data
- sync settings to a developer service

## Permissions

ani2arr declares broad optional host patterns so Firefox can request permission for the exact self-hosted Sonarr origin entered by the user at runtime.

The extension does not automatically gain access to every host covered by those optional patterns. Instead, it requests access only to the specific origin entered by the user in the settings UI.

When the user changes or clears the configured Sonarr URL, ani2arr attempts to remove the previous host permission.

## User control

Users can control data use by:

- choosing whether to configure a Sonarr server at all
- changing or removing the saved Sonarr URL and API key
- disconnecting Sonarr from the extension
- removing the extension and its stored local data through the browser

## Contact

Questions about this policy can be directed to the contact address used for the extension listing and repository.
