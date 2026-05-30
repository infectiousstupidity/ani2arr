/** Options page mapping review list, filters, quick actions, and modal launch. */
// src/options-page/pages/mapping-page.tsx

import { lazy, Suspense, useState, useSyncExternalStore } from "react";
import { AlertCircle } from "lucide-react";
import type { AniListId } from "@/anilist";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { useMappings } from "@/queries/mapping";
import { usePublicOptions } from "@/queries/options";
import { SettingsSection } from "../components/settings-section";
import { Button } from "../components/ui/button";
import { TooltipProvider } from "../components/ui/tooltip";
import { MappingContent } from "./mappings/mappings-virtual-list";
import { MappingsFilterBar } from "./mappings/mappings-filter-bar";
import {
	flattenMappingGroupsForVirtualList,
	flattenMappingPages,
	getLoadedAniListIds,
	getMappingGroupRowCount,
	getMappingsInput,
	getMetadataById,
	getTargetSearchValue,
	readTargetAniListIdFromHash,
	type MappingStatusFilter,
	type ProviderFilter,
} from "./mappings/mapping-page-model";
import { useMappingRowActions } from "./mappings/use-mapping-row-actions";

const MediaModal = lazy(() =>
	import("@/features/media-modal").then((module) => ({
		default: module.MediaModal,
	})),
);

const readCurrentTargetAniListId = (): AniListId | null => {
	if (globalThis.location === undefined) return null;
	return readTargetAniListIdFromHash(globalThis.location.hash);
};

const subscribeHashChange = (onStoreChange: () => void): (() => void) => {
	globalThis.addEventListener("hashchange", onStoreChange);
	return () => globalThis.removeEventListener("hashchange", onStoreChange);
};

const getServerTargetAniListId = (): AniListId | null => null;

function useHashTargetAniListId(): AniListId | null {
	return useSyncExternalStore(
		subscribeHashChange,
		readCurrentTargetAniListId,
		getServerTargetAniListId,
	);
}

export const MappingsPage = (): React.JSX.Element => {
	const targetAniListId = useHashTargetAniListId();
	const initialTargetSearch = getTargetSearchValue(targetAniListId);

	const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
	const [statusFilter, setStatusFilter] = useState<MappingStatusFilter>("all");
	const [searchQuery, setSearchQuery] = useState(() => initialTargetSearch);
	const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
		() => new Set(),
	);
	const [prevTargetId, setPrevTargetId] =
		useState<AniListId | null>(targetAniListId);

	if (targetAniListId !== prevTargetId) {
		setPrevTargetId(targetAniListId);
		setSearchQuery(getTargetSearchValue(targetAniListId));
	}

	const { data: publicOptions } = usePublicOptions();
	const preferredTitleLanguage =
		publicOptions?.ui.preferredAniListTitleLanguage ?? "english";

	const mappingsInput = getMappingsInput(
		providerFilter,
		statusFilter,
		searchQuery,
	);
	const mappingsQuery = useMappings(mappingsInput);

	const groups = flattenMappingPages(mappingsQuery.data?.pages);
	const virtualItems = flattenMappingGroupsForVirtualList({
		groups,
		collapsedGroupKeys,
		highlightedAniListId: targetAniListId,
	});

	const loadedAniListIds = getLoadedAniListIds(groups);
	const metadataQuery = useAniListMetadataBatch(loadedAniListIds, {
		enabled: loadedAniListIds.length > 0,
		refreshStale: false,
	});
	const metadataById = getMetadataById(metadataQuery.data?.metadata);

	const {
		pendingRowKeys,
		actionError,
		handleIgnore,
		handleClearMatch,
		handleEdit,
		mediaModal,
	} = useMappingRowActions(metadataById, preferredTitleLanguage);

	const handleRefresh = (): void => {
		void mappingsQuery.refetch();
		if (loadedAniListIds.length > 0) {
			void metadataQuery.refetch();
		}
	};

	const handleToggleGroup = (groupKey: string): void => {
		setCollapsedGroupKeys((currentKeys) => {
			const nextKeys = new Set(currentKeys);
			if (nextKeys.has(groupKey)) nextKeys.delete(groupKey);
			else nextKeys.add(groupKey);
			return nextKeys;
		});
	};

	const total = mappingsQuery.data?.pages[0]?.total ?? groups.length;
	const loadedRowCount = getMappingGroupRowCount(groups);

	return (
		<TooltipProvider>
			<SettingsSection
				description="Review mapping state, triage manual decisions, and open detailed mapping tools."
				divider="none"
			>
				<MappingsFilterBar
					provider={providerFilter}
					status={statusFilter}
					search={searchQuery}
					isRefreshing={mappingsQuery.isRefetching}
					onProviderChange={setProviderFilter}
					onStatusChange={setStatusFilter}
					onSearchChange={setSearchQuery}
					onRefresh={handleRefresh}
				/>

				{actionError ? (
					<div
						className="flex items-start gap-2 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error"
						role="alert"
					>
						<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
						<span>{actionError}</span>
					</div>
				) : null}

				<div className="flex items-center justify-between gap-4 text-xs text-text-secondary">
					<span>
						{groups.length} visible of {total} groups • {loadedRowCount} mappings
						{metadataQuery.isFetching ? " • Loading AniList metadata..." : ""}
					</span>
					{searchQuery.trim() ? (
						<span className="truncate">Search: {searchQuery.trim()}</span>
					) : null}
				</div>

				<MappingContent
					isInitialLoading={mappingsQuery.isLoading && groups.length === 0}
					error={mappingsQuery.error}
					groupsCount={groups.length}
					virtualItems={virtualItems}
					metadataById={metadataById}
					pendingRowKeys={pendingRowKeys}
					targetAniListId={targetAniListId}
					preferredTitleLanguage={preferredTitleLanguage}
					handleToggleGroup={handleToggleGroup}
					handleIgnore={handleIgnore}
					handleClearMatch={handleClearMatch}
					handleEdit={handleEdit}
					hasNextMappingsPage={mappingsQuery.hasNextPage}
					isFetchingNextMappingsPage={mappingsQuery.isFetchingNextPage}
					fetchNextMappingsPage={mappingsQuery.fetchNextPage}
				/>

				{mappingsQuery.hasNextPage ? (
					<div className="border-t border-border-primary/50 pt-6 text-center">
						<Button
							type="button"
							variant="outline"
							onClick={() => void mappingsQuery.fetchNextPage()}
							disabled={mappingsQuery.isFetchingNextPage}
						>
							{mappingsQuery.isFetchingNextPage ? "Loading..." : "Load more"}
						</Button>
					</div>
				) : null}
			</SettingsSection>

			{mediaModal.state ? (
				<Suspense fallback={null}>
					<MediaModal state={mediaModal.state} onClose={mediaModal.close} />
				</Suspense>
			) : null}
		</TooltipProvider>
	);
};
