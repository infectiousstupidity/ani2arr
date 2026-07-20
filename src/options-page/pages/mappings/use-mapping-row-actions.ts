/** Row mutation and modal-launch actions for options page mappings. */
// src/options-page/pages/mappings/use-mapping-row-actions.ts

import { useState } from "react";
import type { AniListMetadata } from "@/anilist/types";
import type { AniListTitleLanguage } from "@/anilist/title";
import { resolveTitlePreference } from "@/anilist/title";
import type { MediaModalMetadataHint } from "@/features/media-modal";
import { useMediaModalState } from "@/features/media-modal/hooks/use-media-modal-state";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type {
	TmdbId,
	TvdbId,
} from "@/providers/schemas";
import {
	useClearManualMapping,
	useClearMappingIgnore,
	useClearMappingRejectedCandidate,
	useSetMappingIgnore,
	useSetMappingRejectedCandidate,
} from "@/queries/mapping";
import { normalizeError } from "@/shared/errors/error-utils";
import {
	getRowKey,
	type ClearMatchAction,
	type IgnoreAction,
	type MappingRow,
} from "./mapping-page-model";

type ProviderMappingTarget =
	| { provider: "sonarr"; providerId: TvdbId }
	| { provider: "radarr"; providerId: TmdbId };

function createProviderMappingTarget(
	provider: Provider,
	value: unknown,
): ProviderMappingTarget | null {
	if (provider === "sonarr") {
		const providerId = parseTvdbIdOrNull(value);
		return providerId === null ? null : { provider, providerId };
	}

	const providerId = parseTmdbIdOrNull(value);
	return providerId === null ? null : { provider, providerId };
}

const getModalMetadataHint = (input: {
	row: MappingRow;
	metadata: AniListMetadata | null;
	preferredTitleLanguage: AniListTitleLanguage;
}): MediaModalMetadataHint => {
	const { row, metadata, preferredTitleLanguage } = input;
	const title = resolveTitlePreference({
		titles: metadata?.titles ?? null,
		preferred: preferredTitleLanguage,
		fallback: row.providerMeta?.title ?? `AniList #${row.anilistId}`,
	}).primary;
	const hint: MediaModalMetadataHint = { title };
	if (metadata?.format !== undefined) {
		hint.format = metadata.format;
	}

	const coverImage =
		metadata?.coverImage?.large ?? metadata?.coverImage?.medium ?? null;
	if (coverImage !== null) {
		hint.coverImage = coverImage;
	}
	return hint;
};

const getErrorMessage = (error: unknown): string =>
	normalizeError(error).userMessage;

export function useMappingRowActions(
	metadataById: ReadonlyMap<number, AniListMetadata>,
	preferredTitleLanguage: AniListTitleLanguage,
) {
	const [pendingRowKeys, setPendingRowKeys] = useState<Set<string>>(
		() => new Set(),
	);
	const [actionError, setActionError] = useState<string | null>(null);

	const mediaModal = useMediaModalState();
	const setIgnore = useSetMappingIgnore();
	const clearIgnore = useClearMappingIgnore();
	const clearManualMapping = useClearManualMapping();
	const setRejectedCandidate = useSetMappingRejectedCandidate();
	const clearRejectedCandidate = useClearMappingRejectedCandidate();

	const setRowPending = (rowKey: string, isPending: boolean): void => {
		setPendingRowKeys((currentKeys) => {
			const nextKeys = new Set(currentKeys);
			if (isPending) nextKeys.add(rowKey);
			else nextKeys.delete(rowKey);
			return nextKeys;
		});
	};

	const runRowMutation = async (
		row: MappingRow,
		mutation: () => Promise<unknown>,
	): Promise<void> => {
		const rowKey = getRowKey(row);
		setActionError(null);
		setRowPending(rowKey, true);
		try {
			await mutation();
		} catch (error) {
			setActionError(getErrorMessage(error));
		} finally {
			setRowPending(rowKey, false);
		}
	};

	const handleIgnore = (row: MappingRow, action: IgnoreAction): void => {
		void runRowMutation(row, async () => {
			await (action.kind === "clear-ignore"
				? clearIgnore.mutateAsync(action)
				: setIgnore.mutateAsync(action));
		});
	};

	const handleClearMatch = (row: MappingRow, action: ClearMatchAction): void => {
		void runRowMutation(row, async () => {
			if (action.kind === "clear-manual") {
				await clearManualMapping.mutateAsync(action);
				return;
			}

			const target = createProviderMappingTarget(
				action.provider,
				action.providerId,
			);
			if (target === null) return;

			await (action.kind === "clear-rejected"
				? clearRejectedCandidate.mutateAsync({
						source: action.source,
						anilistId: action.anilistId,
						...target,
					})
				: setRejectedCandidate.mutateAsync({
						source: action.source,
						anilistId: action.anilistId,
						...target,
					}));
		});
	};

	const handleEdit = (row: MappingRow): void => {
		const metadata = metadataById.get(row.anilistId) ?? null;
		mediaModal.open({
			source: row.source,
			anilistId: row.anilistId,
			kind: "provider",
			provider: row.provider,
			initialView: "mapping",
			openSource: "options-page",
			metadataHint: getModalMetadataHint({
				row,
				metadata,
				preferredTitleLanguage,
			}),
		});
	};

	return {
		pendingRowKeys,
		actionError,
		handleIgnore,
		handleClearMatch,
		handleEdit,
		mediaModal,
	};
}
