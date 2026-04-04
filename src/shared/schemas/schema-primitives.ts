/** Shared Valibot coercion helpers reused by settings schemas. */
// src/shared/schemas/schema-primitives.ts

import * as v from 'valibot';

// --- Reusable Coercion Schemas ---

/** Trims strings, falls back to empty string. */
export const SafeString = v.fallback(
  v.pipe(v.string(), v.transform((s) => s.trim())),
  ''
);

/** Handles number | string -> number | ''. */
export const CoerceQualityProfileId = v.pipe(
  v.unknown(),
  v.transform((input): number | '' => {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string' && input.trim().length > 0) {
      const parsed = Number(input);
      return Number.isFinite(parsed) ? parsed : '';
    }
    return '';
  })
);

/** Handles array | single item -> array. Filters invalid numbers. */
export const CoerceNumberArray = v.pipe(
  v.unknown(),
  v.transform((input) => {
    const list = Array.isArray(input) ? input : [input];
    const result: number[] = [];
    for (const item of list) {
      const num = Number(item);
      if (Number.isFinite(num)) result.push(num);
    }
    return result;
  }),
  v.array(v.number())
);

/** Handles array | single item -> array. Trims and filters empty strings. */
export const CoerceStringArray = v.pipe(
  v.unknown(),
  v.transform((input) => {
    const list = Array.isArray(input) ? input : [input];
    const result: string[] = [];
    for (const item of list) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) result.push(trimmed);
      }
    }
    return result;
  }),
  v.array(v.string())
);
