import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIMARY_URL = 'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json';
const FALLBACK_URL = 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json';
const OUTPUT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'anilist-static-metadata.json');
const ANILIST_API = 'https://graphql.anilist.co';

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 300;
const GENERATOR_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CHECKPOINT_INTERVAL = 40;

const FETCH_MEDIA_QUERY = `
  query FetchMediaBatch($ids: [Int!]) {
    Page(perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        title { english romaji native }
        seasonYear
        format
        coverImage { medium large extraLarge }
      }
    }
  }
`;

const coerceId = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractAniListIds = (source) => {
  const ids = new Set();
  if (!source || typeof source !== 'object') return ids;

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry;
      const id = coerceId(record.anilist_id ?? record.anilist ?? record.aniId ?? record.id);
      if (id) ids.add(id);
    }
    return ids;
  }

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const record = (typeof rawValue === 'object' && rawValue !== null) ? rawValue : null;
    const explicit = record?.anilist_id ?? record?.anilist ?? record?.aniId;
    const id = coerceId(explicit ?? rawKey);
    if (id) ids.add(id);
  }

  return ids;
};

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return res.json();
};

const loadExisting = (file) => {
  try {
    if (!fs.existsSync(file)) return { generatedAt: 0, entries: [] };
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to load existing metadata: ${error.message}`);
    return { generatedAt: 0, entries: [] };
  }
};

const pickCover = (coverImage) => {
  if (!coverImage || typeof coverImage !== 'object') return null;
  return {
    medium: coverImage.medium ?? null,
    large: coverImage.large ?? coverImage.extraLarge ?? null,
  };
};

const toMetadataEntry = (media) => ({
  id: media.id,
  titles: media.title ?? {},
  seasonYear: media.seasonYear ?? null,
  format: media.format ?? null,
  coverImage: pickCover(media.coverImage),
  updatedAt: Date.now(),
});

const persistBundle = (entries, generatedAt = Date.now()) => {
  const deduped = Array.from(
    new Map(entries.map((entry) => [entry.id, entry])).entries(),
  )
    .map(([, entry]) => entry)
    .sort((a, b) => a.id - b.id);

  const payload = {
    generatedAt,
    entries: deduped,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  return deduped;
};

const fetchMetadataBatch = async (ids, attempt = 0) => {
  if (ids.length === 0) return [];
  const resp = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: FETCH_MEDIA_QUERY, variables: { ids } }),
  });
  if (!resp.ok) {
    if (resp.status === 429 && attempt < 5) {
      const retryAfterHeader = resp.headers.get('Retry-After');
      const retryAfterSeconds = Number(retryAfterHeader);
      const retryAfter = !isNaN(retryAfterSeconds) ? retryAfterSeconds * 1000 : 5000;
      await delay(retryAfter);
      return fetchMetadataBatch(ids, attempt + 1);
    }
    throw new Error(`AniList request failed (${resp.status})`);
  }
  const json = await resp.json();
  const media = json?.data?.Page?.media;
  if (!Array.isArray(media)) return [];
  return media.filter((m) => m && typeof m.id === 'number').map(toMetadataEntry);
};

const main = async () => {
  const existing = loadExisting(OUTPUT_FILE);
  const existingMap = new Map();
  for (const entry of existing.entries ?? []) {
    if (entry && typeof entry.id === 'number') {
      existingMap.set(entry.id, entry);
    }
  }

  console.log('Fetching upstream mapping sources...');
  const [primary, fallback] = await Promise.all([fetchJson(PRIMARY_URL), fetchJson(FALLBACK_URL)]);
  const ids = new Set([...extractAniListIds(primary), ...extractAniListIds(fallback)]);
  if (ids.size === 0) {
    console.error('No AniList IDs found from static mapping sources.');
    process.exit(1);
  }
  console.log(`Discovered ${ids.size} AniList IDs from static mappings.`);

  const freshEntries = [];
  const toFetch = [];
  const now = Date.now();
  for (const id of ids) {
    const existingEntry = existingMap.get(id);
    if (existingEntry && now - (existingEntry.updatedAt ?? 0) < GENERATOR_STALE_MS) {
      freshEntries.push(existingEntry);
    } else {
      toFetch.push(id);
    }
  }

  console.log(`Reusing ${freshEntries.length} fresh entries; fetching ${toFetch.length} missing/stale entries.`);

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    try {
      const entries = await fetchMetadataBatch(batch);
      freshEntries.push(...entries);
      console.log(`Fetched batch ${i / BATCH_SIZE + 1}/${Math.ceil(toFetch.length / BATCH_SIZE)} (${entries.length} entries)`);
      await delay(BATCH_DELAY_MS);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      if (batchNumber % CHECKPOINT_INTERVAL === 0) {
        const snapshot = persistBundle(freshEntries);
        console.log(`Checkpoint saved (${snapshot.length} entries)`);
      }
    } catch (error) {
      console.warn(`Batch ${i / BATCH_SIZE + 1} failed: ${error.message}`);
    }
  }

  const finalBundle = persistBundle(freshEntries, Date.now());
  console.log(`Wrote ${finalBundle.length} entries to ${OUTPUT_FILE}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
