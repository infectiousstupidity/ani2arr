Data/version date: 2025-10-07 06:40:30Z

I parsed the latest HAR and reviewed your console logs. You’ve rolled back cancellation. Focus should be on slashing Sonarr GETs and tail latency by maximizing local matches and eliminating near-duplicate lookups. OPTIONS will remain - you send X-Api-Key.

# What the HAR/logs say

* Preflights persist at roughly 1:1 with Sonarr GETs. Expected given X-Api-Key.
* Tail still driven by `series/lookup` cold misses:

  * Examples at 3+ s:
    `Hands off: Sawaranaide Kotesashi-kun! Mini Anime` (4131 ms),
    `Koala's Diary` (3279 ms),
    `Move! Cat Folktales` (3067 ms),
    `Ganso! Bandori-chan 2025` (1876 ms),
    several 0.8–1.2 s lookups.
* Multiple variants per title hit Sonarr back-to-back:

  * With and without year: `… 2025` vs base title.
  * English vs romaji vs punctuation/mark variants: `Golden Kamuy: …` vs `… 2025`; `GANSO! BanG Dream Chan` vs `… 2025` vs `Ganso! Bandori-chan 2025`.
* Mapping failures are common for these IDs (VALIDATION_ERROR). Those should be strongly neg-cached to avoid reattempts in-session.

# Root causes

1. Variant fan-out: multiple near-identical terms are sent for a single AniList ID when one high-quality term would suffice.
2. Normalization gaps: punctuation, slashes, and year suffixes produce distinct query strings that bypass your term-cache and inflight dedupe.
3. Under-leveraged local index: you now persist canonical and alternate titles - good - but lookups still go to Sonarr for terms the index should satisfy.
4. Weak negative caching across layers: AniList ID level failures happen repeatedly within the scenario.

# Prioritized plan (no code, just exact targets)

## A) Collapse term variants aggressively (highest impact)

* Define a strict “canonical lookup term” function used for:

  * index keys, term-cache keys, inflight keys, and the first Sonarr query.
* Canonicalization rules to enforce:

  * Strip or normalize punctuation: colon, exclamation, slashes → space; quotes; wide punctuation; multiple spaces to single space.
  * Remove trailing “year” tokens unless the base title produces low scoring candidates. Only append year as a second attempt if needed.
  * Normalize common particles and stop-phrases: keep your stopword list, add “mini”, “special”, “short”, “season”, “part”, language markers like “Anime”, and duplicate English descriptors that Sonarr doesn’t use.
  * Case-fold and KKC normalization already covered in your `normTitle`, but ensure **term strings sent to Sonarr** follow the same canonicalization as the **cache keys**. Right now your queries like `… 2025` and base title are treated as different cache keys.
* Policy: attempt at most 1 canonical term per media; only attempt a second term if the first returns candidates but scores below threshold. No third attempt unless a hint demands it.

Success criteria:

* Duplicate GET groups go to zero after warm-up.
* Sonarr GET count per “batch run” drops by 30-50% versus this HAR.

## B) Maximize local short-circuits using the richer index

* Expand the index probe before any network:

  * Build a set of normalized keys from: canonical title, alternates, title slug, and obvious year-appended variants for short titles.
* Exact match first; if none, do a lightweight fuzzy probe locally:

  * token-overlap with rare-token requirement (you already have `computeTitleMatchScore` - reuse locally). Only hit Sonarr if local score < threshold.
* Record and expose an “index hit rate” metric.

Success criteria:

* Index hit rate displayed (target 30-60% on your flow).
* Corresponding reduction in Sonarr GETs and bytes.

## C) Strengthen negative caching (per AniList ID and per canonical term)

* For AniList IDs that map to no TVDB (VALIDATION_ERROR), cache the failure longer for the session (e.g., hours not minutes) so repeated visits don’t re-query Sonarr with new near-identical terms.
* For canonical lookup terms that return empty/irrelevant candidates, store a negative term cache entry with a session-long TTL. Tie-break with a version/epoch so you can clear on mappings refresh.

Success criteria:

* No repeated VALIDATION_ERROR retries for the same AniList ID within the same session.
* “Empty” terms are not re-queried within the scenario.

## D) Global concurrency shaping for lookups

* Enforce a **single global limiter** for Sonarr `series/lookup` with a small parallelism (e.g., 2) and short spacing (≈100 ms) to protect p95 when several misses occur together.
* Keep inflight collapse at the canonical-term level.

Success criteria:

* Sonarr p95 total drops to ≤ 1200 ms on cold, ≤ 250 ms warm in the same scenario.
* Fewer multi-second outliers in “slowest” list.

## E) Make scoring decide when to try the year variant

* Use the first canonical term’s result set to compute the best score. Only if the top score is below a conservative threshold, try `term + year`. If you already do this, tighten the threshold so the second term is rarer.
* Do not issue both base and year variants unconditionally for the same media.

Success criteria:

* Eliminate pairs like `“…title”` immediately followed by `“…title 2025”` unless the first scored poorly.

## F) Session-level “seen terms” filter

* Maintain a session-scoped set of canonical terms already attempted (success or failure). If a different media proposes the exact same canonical term later in the session, reuse term-cache results and never re-hit Sonarr.

Success criteria:

* When the same English translation appears for multiple AniList items, Sonarr is not called again.

# What not to chase

* Removing OPTIONS: not possible with X-Api-Key in headers and no server changes. Aim to reduce GETs; OPTIONS will fall proportionally.
* Cancellation: you reverted it. Fine. With the above, the number of requested lookups drops, so cancellation becomes less necessary.

# Minimal telemetry to add

* `index_hits`, `index_misses`
* `term_canonicalized`, `term_cache_hits`, `term_neg_hits`, `term_network_misses`
* `lookup_inflight_hits`
* `sonarr_get_count`, `sonarr_options_count`
* `lookup_p95_ms`, `lookup_p99_ms`

This keeps the system simple, avoids the cancellation complexity you rolled back, and targets the real culprits in your logs: variant fan-out and insufficient local short-circuiting.
