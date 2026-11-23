# Post-merge decisions

- Mapping precedence is manual, then upstream (AniBridge), then automatic,
  independently for each value. Manual wins; clear it to return to AniBridge.
  The proposed gap-fill/override model was rejected.
- Seerr uses TMDB season numbering. Do not preselect seasons without TMDB
  season evidence; TVDB seasons are not a substitute.
- Radarr and Seerr share one `tmdbMovie` mapping.
- Upstream and automatic stores are caches: they do not decode legacy data and
  discard malformed records. Only the manual store migrates legacy data.
- Keep the settings public/private split, but do not treat it as a security
  boundary: content scripts can read extension local storage.
- Share Sonarr/Radarr code through plain values where behavior is identical;
  keep their library caches and RPC handlers separate intentionally.
- Anti-churn: each PR must remove more lines than it adds or fix a reproduced
  bug. Add a design document only when it replaces several existing ones.

For current mapping behavior and boundaries, see [the mapping README](../src/mapping/README.md),
which is the mapping source of truth.
