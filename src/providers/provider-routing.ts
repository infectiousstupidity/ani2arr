/** Provider routing for supported providers. */
// src/providers/provider-routing.ts

import type { AniListMediaFormat } from "@/anilist/types";
import type { Provider } from "./types";

export const resolveProviderForAniListFormat = (
	format: AniListMediaFormat | null | undefined,
): Provider | null => {
	switch (format) {
		case "MOVIE": {
			return "radarr";
		}
		case "TV":
		case "TV_SHORT":
		case "SPECIAL":
		case "OVA":
		case "ONA": {
			return "sonarr";
		}
		case "MUSIC":
		case "MANGA":
		case "NOVEL":
		case "ONE_SHOT":
		case null:
		case undefined: {
			return null;
		}
		default: {
			return null;
		}
	}
};
