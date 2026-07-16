/** Options page mapping review list, filters, quick actions, and modal launch. */
// src/options-page/pages/mapping-page.tsx

import { lazy, Suspense, useMemo, useState } from "react";
import type { AniListId } from "@/anilist/types";
import { AlertCircle } from "lucide-react";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { useMappings } from "@/queries/mapping";
import { usePublicOptions } from "@/queries/options";
import Button from "@/shared/ui/primitives/button";
import { TooltipProvider } from "@/shared/ui/primitives/tooltip";
import { SettingsSection } from "../components/settings-section";
import { MappingContent } from "./mappings/mappings-list";
import { MappingsFilterBar } from "./mappings/mappings-filter-bar";
import {
	getFilteredMappingGroups,
	getLoadedMappingRowCount,
	getMetadataById,
	getTargetSearchValue,
	getVisibleAniListMetadataIds,
	readTargetAniListIdFromHash,
	type MappingSourceFilter,
	type MappingStatusFilter,
	type ProviderFilter,
} from "./mappings/mapping-page-model";
import { useMappingRowActions } from "./mappings/use-mapping-row-actions";

const MediaModal = lazy(() =>
	import("@/features/media-modal").then((module) => ({
		default: module.MediaModal,
	})),
);

const MAPPING_GROUP_PAGE_SIZE = 50;

interface MappingsPageProps {
	hash: string;
}

export const MappingsPage = ({ hash }: MappingsPageProps): React.JSX.Element => {
	const targetAniListId = readTargetAniListIdFromHash(hash);

	return (
		<MappingsPageContent
			key={targetAniListId ?? "all"}
			targetAniListId={targetAniListId}
		/>
	);
};

interface MappingsPageContentProps {
	targetAniListId: AniListId | null;
}

const MappingsPageContent = ({
	targetAniListId,
}: MappingsPageContentProps): React.JSX.Element => {
	const initialTargetSearch = getTargetSearchValue(targetAniListId);
	const initialStatusFilter: MappingStatusFilter =
		targetAniListId === null ? "needs-review" : "all";

	const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
	const [statusFilter, setStatusFilter] =
		useState<MappingStatusFilter>(initialStatusFilter);
	const [sourceFilter, setSourceFilter] = useState<MappingSourceFilter>("all");
	const [searchQuery, setSearchQuery] = useState(() => initialTargetSearch);
	const [visibleLimit, setVisibleLimit] = useState(MAPPING_GROUP_PAGE_SIZE);
	const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
		() => new Set(),
	);

	const { data: publicOptions } = usePublicOptions();
	const preferredTitleLanguage =
		publicOptions?.ui.preferredAniListTitleLanguage ?? "english";

	const mappingsQuery = useMappings();
	const filteredMappings = useMemo(
		() =>
			getFilteredMappingGroups({
				groups: mappingsQuery.data?.groups ?? [],
				provider: providerFilter,
				status: statusFilter,
				source: sourceFilter,
				search: searchQuery,
				limit: visibleLimit,
			}),
		[
			mappingsQuery.data?.groups,
			providerFilter,
			searchQuery,
			sourceFilter,
			statusFilter,
			visibleLimit,
		],
	);
	const groups = filteredMappings.groups;
	const visibleAniListIds = useMemo(
		() =>
			getVisibleAniListMetadataIds({
				groups,
				collapsedGroupKeys,
				highlightedAniListId: targetAniListId,
			}),
		[collapsedGroupKeys, groups, targetAniListId],
	);
	const metadataQuery = useAniListMetadataBatch(visibleAniListIds, {
		enabled: visibleAniListIds.length > 0,
	});
	const metadataById = useMemo(
		() => getMetadataById(metadataQuery.data?.metadata),
		[metadataQuery.data?.metadata],
	);

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
		if (visibleAniListIds.length > 0) {
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

	const totalGroups = filteredMappings.total;
	const resetVisibleLimit = (): void => {
		setVisibleLimit(MAPPING_GROUP_PAGE_SIZE);
	};

	return (
		<TooltipProvider>
			<SettingsSection
				description="Review mapping state, triage manual decisions, and open detailed mapping tools."
				divider="none"
			>
				<MappingsFilterBar
					provider={providerFilter}
					status={statusFilter}
					source={sourceFilter}
					search={searchQuery}
					isRefreshing={mappingsQuery.isRefetching}
					onProviderChange={(provider) => {
						resetVisibleLimit();
						setProviderFilter(provider);
					}}
					onStatusChange={(status) => {
						resetVisibleLimit();
						setStatusFilter(status);
					}}
					onSourceChange={(source) => {
						resetVisibleLimit();
						setSourceFilter(source);
					}}
					onSearchChange={(search) => {
						resetVisibleLimit();
						setSearchQuery(search);
					}}
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
						{groups.length} of {totalGroups} groups •{" "}
						{getLoadedMappingRowCount(groups)} mappings loaded
						{metadataQuery.isFetching ? " • Loading AniList metadata..." : ""}
					</span>
					{searchQuery.trim() ? (
						<span className="truncate">Search: {searchQuery.trim()}</span>
					) : null}
				</div>

				<MappingContent
					isInitialLoading={mappingsQuery.isLoading && groups.length === 0}
					error={mappingsQuery.error}
					groups={groups}
					collapsedGroupKeys={collapsedGroupKeys}
					metadataById={metadataById}
					pendingRowKeys={pendingRowKeys}
					targetAniListId={targetAniListId}
					preferredTitleLanguage={preferredTitleLanguage}
					handleToggleGroup={handleToggleGroup}
					handleIgnore={handleIgnore}
					handleClearMatch={handleClearMatch}
					handleEdit={handleEdit}
				/>

				{groups.length < totalGroups ? (
					<div className="border-t border-border-primary/50 pt-6 text-center">
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								setVisibleLimit((current) => current + MAPPING_GROUP_PAGE_SIZE)
							}
						>
							Load more
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
