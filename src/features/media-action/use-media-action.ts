/** Shared media-action hook for provider-neutral action state, URLs, and commands. */
// src/features/media-action/use-media-action.ts

import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { MappingResult } from "@/mapping/types";
import type { Provider } from "@/providers/types";
import { getProviderOpenTarget } from "@/providers/provider-links";
import { openProviderPage } from "@/rpc/provider-page";
import type { SourceRpcInput, StatusInput } from "@/rpc/types";
import { sourceFromInput } from "@/rpc/source-input";
import { getMediaActionStatus, type MediaActionStatus } from "./state";

type MediaActionIdentity =
	| { source: SourceIdentity; anilistId?: AniListId }
	| { source?: undefined; anilistId: AniListId };

export type MediaActionInputBase<TForm> = MediaActionIdentity & {
	displayTitle: string;
	providerTitle: string | null;
	metadata: AniListMediaHint | null;
	isConfigured: boolean;
	defaultForm: TForm | null;
	enabled: boolean;
	statusBlocked?: boolean;
	forceVerify?: boolean;
	forceMappingRetry?: boolean;
	onConfigure(): void;
	onOpenMapping(): void;
};

export interface MediaAction {
	status: MediaActionStatus;
	openProvider: (() => void) | null;
	runPrimaryAction(): void;
}

interface MediaActionStatusOptions {
	enabled: boolean;
	force_verify?: boolean;
	force_mapping_retry?: boolean;
}

interface MediaActionStatusData {
	mapping: MappingResult;
	isInLibrary: boolean | null;
}

interface MediaActionStatusQuery {
	isLoading: boolean;
	fetchStatus: "fetching" | "paused" | "idle";
	data: MediaActionStatusData | undefined;
	isError: boolean;
	refetch(options: { throwOnError: false }): Promise<unknown>;
}

interface MediaActionMutationState {
	data: unknown;
	isPending: boolean;
	isError: boolean;
	isSuccess: boolean;
	reset(): void;
}

type UseMediaActionInput<TForm> = MediaActionInputBase<TForm> & {
	provider: Provider;
	statusQuery: MediaActionStatusQuery;
	addMutation: MediaActionMutationState;
	hasProviderId: boolean;
	providerRouteSlug: string | null;
	runQuickAdd(): void;
};

function isQueryChecking(input: {
	isLoading: boolean;
	fetchStatus: "fetching" | "paused" | "idle";
	data: unknown;
}): boolean {
	return input.isLoading || (input.fetchStatus === "fetching" && !input.data);
}

function shouldEnableStatus(input: MediaActionInputBase<unknown>): boolean {
	return input.enabled && input.isConfigured && input.statusBlocked !== true;
}

export function mediaActionSourceInput(
	input: MediaActionIdentity,
): SourceRpcInput {
	if (input.source !== undefined) {
		return "anilistId" in input && input.anilistId !== undefined
			? { source: input.source, anilistId: input.anilistId }
			: { source: input.source };
	}

	return { anilistId: input.anilistId };
}

export function buildMediaActionStatusQuery(
	input: MediaActionInputBase<unknown>,
): {
	payload: Pick<StatusInput, "metadata" | "source" | "title">;
	options: MediaActionStatusOptions;
} {
	const payload: Pick<StatusInput, "metadata" | "source" | "title"> = {
		source: sourceFromInput(mediaActionSourceInput(input)),
		metadata: input.metadata,
	};
	if (input.providerTitle !== null) {
		payload.title = input.providerTitle;
	}

	const options: MediaActionStatusOptions = {
		enabled: shouldEnableStatus(input),
	};
	if (input.forceVerify !== undefined) {
		options.force_verify = input.forceVerify;
	}
	if (input.forceMappingRetry !== undefined) {
		options.force_mapping_retry = input.forceMappingRetry;
	}

	return { payload, options };
}

export function useMediaAction<TForm>(
	input: UseMediaActionInput<TForm>,
): MediaAction {
	const mapping = input.statusQuery.data?.mapping;
	const status = getMediaActionStatus({
		isConfigured: input.isConfigured,
		isChecking:
			input.statusBlocked === true || isQueryChecking(input.statusQuery),
		isAdding: input.addMutation.isPending,
		hasAddError: input.addMutation.isError,
		hasStatusError: input.statusQuery.isError,
		addSucceeded: input.addMutation.isSuccess,
		mapping,
		isInLibrary: input.statusQuery.data?.isInLibrary ?? null,
		hasProviderId: input.hasProviderId,
		canQuickAdd: input.providerTitle !== null && input.defaultForm !== null,
	});
	const searchTerm =
		mapping?.kind === "mapped"
			? (mapping.matchedTitle ?? input.displayTitle)
			: input.displayTitle;
	const providerOpenTarget =
		status.state === "unconfigured"
			? null
			: getProviderOpenTarget({
					isInLibrary:
						status.state === "in-library" && input.providerRouteSlug !== null,
					providerRouteSlug: input.providerRouteSlug,
					searchTerm,
				});

	return {
		status,
		openProvider: providerOpenTarget
			? () => openProviderPage({
					provider: input.provider,
					target: providerOpenTarget,
				})
			: null,
		runPrimaryAction: () => {
			switch (status.action) {
				case "configure": {
					input.onConfigure();
					return;
				}
				case "open-mapping": {
					input.onOpenMapping();
					return;
				}
				case "retry-status": {
					void input.statusQuery
						.refetch({ throwOnError: false })
						.catch(() => {});
					return;
				}
				case "retry-add": {
					input.addMutation.reset();
					input.runQuickAdd();
					return;
				}
				case "quick-add": {
					input.runQuickAdd();
					return;
				}
				case "none": {
					return;
				}
			}
		},
	};
}
