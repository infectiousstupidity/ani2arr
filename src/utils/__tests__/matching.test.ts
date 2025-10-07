import { describe, expect, it } from 'vitest';

import { canonicalizeLookupTerm, computeTitleMatchScore, normTitle, tokenize } from '@/utils/matching';

describe('canonicalizeLookupTerm', () => {
  it('normalizes punctuation, stopwords, and whitespace', () => {
    expect(canonicalizeLookupTerm('The Legend of Zelda: Breath of the Wild')).toBe(
      'legend zelda breath wild',
    );
  });

  it('collapses slashes and quotes and strips boilerplate tokens', () => {
    expect(canonicalizeLookupTerm('“Kaguya-sama: Love Is War” / Season 2')).toBe(
      'kaguya sama love is war 2',
    );
  });

  it('normalizes heavily punctuated shonen titles for lookup', () => {
    expect(canonicalizeLookupTerm('“Naruto” Shippuden!!!')).toBe('naruto shippuden');
  });

  it('removes trailing years by default but can retain them when requested', () => {
    expect(canonicalizeLookupTerm('Fullmetal Alchemist: Brotherhood (2009)')).toBe(
      'fullmetal alchemist brotherhood',
    );
    expect(
      canonicalizeLookupTerm('Fullmetal Alchemist: Brotherhood (2009)', { keepYear: true }),
    ).toBe('fullmetal alchemist brotherhood 2009');
  });

  it('retains explicit years embedded in titles when requested', () => {
    expect(canonicalizeLookupTerm('Bleach (2004)', { keepYear: true })).toBe('bleach 2004');
  });
});

describe('normTitle', () => {
  it('normalizes whitespace, punctuation, and casing', () => {
    expect(normTitle(' “Attack—on・Titan” (Final Season) ')).toBe('attack-on titan final season');
  });
});

describe('tokenize', () => {
  it('drops stopwords, single characters, and normalizes level tokens', () => {
    expect(tokenize('the legend of lvl a heroes')).toEqual(['legend', 'level', 'heroes']);
  });
});

describe('computeTitleMatchScore', () => {
  it('requires an intersection of rare tokens', () => {
    expect(
      computeTitleMatchScore({
        queryRaw: 'The Series',
        candidateRaw: 'The Series',
      }),
    ).toBe(0);
  });

  it('rewards strong matches with year bonuses', () => {
    expect(
      computeTitleMatchScore({
        queryRaw: 'Attack on Titan Final Season',
        candidateRaw: 'Attack on Titan Final Season',
        candidateYear: 2020,
        targetYear: 2020,
      }),
    ).toBe(1);
  });

  it('applies smaller bonuses when the year differs by one', () => {
    const score = computeTitleMatchScore({
      queryRaw: 'Attack on Titan Final Season',
      candidateRaw: 'Attack on Titan Final Season Part 2',
      candidateYear: 2021,
      targetYear: 2020,
    });

    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeLessThan(1);
  });

  it('penalizes genre mismatches', () => {
    const base = computeTitleMatchScore({
      queryRaw: 'Fullmetal Alchemist Brotherhood',
      candidateRaw: 'Fullmetal Alchemist Brotherhood',
      candidateYear: 2009,
      targetYear: 2009,
    });

    const penalized = computeTitleMatchScore({
      queryRaw: 'Fullmetal Alchemist Brotherhood',
      candidateRaw: 'Fullmetal Alchemist Brotherhood',
      candidateYear: 2009,
      targetYear: 2009,
      candidateGenres: ['Drama'],
    });

    expect(penalized).toBeLessThan(base);
    expect(penalized).toBeGreaterThan(0);
  });

  it('attenuates scores when the query is a single token but the candidate is verbose', () => {
    const concise = computeTitleMatchScore({
      queryRaw: 'Naruto',
      candidateRaw: 'Naruto',
    });

    const verbose = computeTitleMatchScore({
      queryRaw: 'Naruto',
      candidateRaw: 'Naruto Ultimate Ninja Storm Trilogy',
    });

    expect(verbose).toBeLessThan(concise);
    expect(verbose).toBeGreaterThan(0);
  });
});
