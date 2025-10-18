import { describe, expect, it, vi } from 'vitest';

import { generateSearchTerms, isSeasonalCanonicalTokens } from '../search-term-generator';
import * as matching from '@/utils/matching';
import type { AniTitles } from '@/types';

describe('isSeasonalCanonicalTokens', () => {
  it('treats an empty token list as seasonal', () => {
    expect(isSeasonalCanonicalTokens([])).toBe(true);
  });

  it('returns true for season descriptors, roman numerals, and season codes', () => {
    expect(isSeasonalCanonicalTokens(['season', 'iii', 'cour', 's02', 'part'])).toBe(true);
  });

  it('returns false when tokens include non-seasonal terms', () => {
    expect(isSeasonalCanonicalTokens(['Season', 'Finale'])).toBe(false);
  });
});

describe('generateSearchTerms', () => {
  const titles: AniTitles = {
    romaji: 'Hagane no Renkinjutsushi',
    english: 'Fullmetal Alchemist (2003)',
    native: '鋼の錬金術師',
  };

  it('deduplicates canonical keys, strips seasonal noise, and honors priority ordering', () => {
    const synonyms = [
      'Fullmetal Alchemist',
      'Fullmetal Alchemist - Season 2',
      'FMA: Brotherhood',
      '鋼の錬金術師 シーズン2',
    ];

    const terms = generateSearchTerms(titles, synonyms);
    const displays = terms.map(term => term.display);
    const canonicals = terms.map(term => term.canonical);

    // english title is first and stripped of the year suffix in parentheses
    expect(displays[0]).toBe('Fullmetal Alchemist');

    // romaji and native titles are present in the prioritized order
    expect(displays).toContain('Hagane no Renkinjutsushi');
    expect(displays).toContain('鋼の錬金術師');
    expect(displays.indexOf('Hagane no Renkinjutsushi')).toBeLessThan(displays.indexOf('鋼の錬金術師'));

    // seasonal-only synonyms are ignored
    expect(displays).not.toContain('Fullmetal Alchemist - Season 2');

    // canonical keys remain unique even when sanitized display strings collide
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  it('adds stripped-parenthesis variants when they differ from the primary title', () => {
    const customTitles: AniTitles = {
      english: 'My Hero Academia (TV)'
    };

    const terms = generateSearchTerms(customTitles, undefined);
    const displays = terms.map(term => term.display);

    expect(displays).toContain('My Hero Academia');
    expect(displays).not.toContain('My Hero Academia (TV)');
  });

  it('registers stripped variants when sanitized forms differ', () => {
    const actualSanitize = matching.sanitizeLookupDisplay;
    let callIndex = 0;
    const sanitizeSpy = vi.spyOn(matching, 'sanitizeLookupDisplay').mockImplementation(value => {
      if (callIndex === 0) {
        callIndex += 1;
        return 'Primary Title';
      }
      if (callIndex === 1) {
        callIndex += 1;
        return 'Primary Title Stripped';
      }
      return actualSanitize(value);
    });

    const terms = generateSearchTerms(
      { english: 'Ignored' },
      undefined,
    );

    expect(terms.map(term => term.display)).toContain('Primary Title Stripped');
    sanitizeSpy.mockRestore();
  });
});
