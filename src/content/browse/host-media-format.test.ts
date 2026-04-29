import { describe, expect, it } from 'vitest';
import { parseAniListMediaFormatLabel } from '@/anilist/schemas/media.schema';

describe('host media format parsing', () => {
  it('parses risky browse format labels', () => {
    expect(parseAniListMediaFormatLabel('TV Show')).toBe('TV');
    expect(parseAniListMediaFormatLabel('TV Short')).toBe('TV_SHORT');
    expect(parseAniListMediaFormatLabel('Movies')).toBe('MOVIE');
    expect(parseAniListMediaFormatLabel('OVA / ONA / SPECIAL')).toBe('SPECIAL');
  });
});
