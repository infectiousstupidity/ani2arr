import { normalizeTitleTokens } from './normalize';

export function canonicalTitleKey(term: string, options: { keepYear?: boolean } = {}): string {
  const { tokens } = normalizeTitleTokens(term, {
    stripDiacritics: true,
    filterStopwords: false,
    keepYear: options.keepYear === true,
    mutateTokens: false,
    allowSingleLetters: true,
  });
  return tokens.join(' ');
}
