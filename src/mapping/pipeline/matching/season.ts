/** Compatibility exports for Sonarr lookup title cleanup. */
// src/mapping/pipeline/matching/season.ts

import { stripParenContent } from "./normalize";
import { stripSeasonalSuffixes } from "@/mapping/title-normalization";

function cleanTitleDecorations(s: string): string {
	if (!s) return "";
	return (
		s
			// Decorative CJK brackets
			.replaceAll(/[\u3008-\u3011\u3014\u3015]/g, "") // 【】「」『』〔〕〈〉《》
			// Fancy quotes range
			.replaceAll(/[\u2018-\u201F\u275B\u275C]/g, "")
			.replaceAll(/["']/g, "")
			.replaceAll(/\s+/g, " ")
			.trim()
	);
}

// Remove a trailing pure ordinal/roman/numeric token without an explicit anchor
// Examples: "Sousou no Frieren 2nd" -> "Sousou no Frieren"
//           "Kagaku x Bouken Survival! II" -> "Kagaku x Bouken Survival!"
//           "Oshiri Tantei 9" -> "Oshiri Tantei"
export function stripTrailingOrdinalOrNumber(s: string): string {
	const trimmed = s.trim();
	if (!trimmed) return "";
	const tokens = trimmed.split(/\s+/);
	if (tokens.length <= 1) return trimmed;

	while (tokens.length > 1) {
		const last = tokens.at(-1) as string;
		if (/^(?:\d+|\d+(?:st|nd|rd|th)|[cdilmvx]+)$/i.test(last)) {
			tokens.pop();
			continue;
		}
		break;
	}

	return tokens.join(" ").trim();
}

export function sanitizeLookupDisplay(term: string): string {
	if (!term) return "";
	let s = cleanTitleDecorations(term);

	// Preserve meaningful content inside ASCII square brackets by unwrapping instead of removing
	// Example: "[Oshi no Ko] 3rd Season" -> "Oshi no Ko 3rd Season"
	s = s.replaceAll(/\[([^\]]+)]/g, "$1");

	// Sonarr benefits from sequel/season cleanup before lookup.
	const seasonalReduced = stripSeasonalSuffixes(s);
	const trailingStripped = stripTrailingOrdinalOrNumber(seasonalReduced);

	// Finally, remove any remaining parenthetical/braced segments like (TV), {2024}
	const noParens = stripParenContent(trailingStripped);
	const normalized = noParens.replaceAll(/\s+/g, " ").trim();
	return /[\p{L}\p{N}]/u.test(normalized) ? normalized : "";
}
