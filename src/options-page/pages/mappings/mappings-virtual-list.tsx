/** Virtualized mapping list and loading states for the options page. */
// src/options-page/pages/mappings/mappings-virtual-list.tsx

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AniListId } from "@/anilist";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import type { AniListTitleLanguage } from "@/anilist/schemas/title-language.schema";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { cn } from "@/shared/utils/cn";
import { MappingsAniListRow } from "./mappings-anilist-row";
import { MappingsProviderGroup } from "./mappings-provider-group";
import {
	getRowKey,
	type ClearMatchAction,
	type IgnoreAction,
	type MappingRow,
	type MappingVirtualItem,
} from "./mapping-page-model";

const VIRTUAL_OVERSCAN = 10;
const LOAD_MORE_THRESHOLD = 12;

interface VirtualizedMappingListProps {
	virtualItems: MappingVirtualItem[];
	metadataById: ReadonlyMap<number, AniListMetadata>;
	pendingRowKeys: Set<string>;
	targetAniListId: AniListId | null;
	preferredTitleLanguage: AniListTitleLanguage;
	handleToggleGroup: (groupKey: string) => void;
	handleIgnore: (row: MappingRow, action: IgnoreAction) => void;
	handleClearMatch: (row: MappingRow, action: ClearMatchAction) => void;
	handleEdit: (row: MappingRow) => void;
	hasNextMappingsPage: boolean;
	isFetchingNextMappingsPage: boolean;
	fetchNextMappingsPage: () => void;
}

function VirtualizedMappingList(props: VirtualizedMappingListProps) {
	// Explicitly opt out of the React Compiler. TanStack Virtual v3 mutates
	// refs during render, which breaks the Rules of React and causes stale UI if compiled.
	"use no memo";

	const {
		virtualItems,
		metadataById,
		pendingRowKeys,
		targetAniListId,
		preferredTitleLanguage,
		handleToggleGroup,
		handleIgnore,
		handleClearMatch,
		handleEdit,
		hasNextMappingsPage,
		isFetchingNextMappingsPage,
		fetchNextMappingsPage,
	} = props;

	const listViewportRef = useRef<HTMLDivElement | null>(null);

	// eslint-disable-next-line react-hooks/incompatible-library
	const rowVirtualizer = useVirtualizer({
		count: virtualItems.length,
		getScrollElement: () => listViewportRef.current,
		estimateSize: (index) => (virtualItems[index]?.kind === "group" ? 66 : 96),
		overscan: VIRTUAL_OVERSCAN,
		getItemKey: (index) => virtualItems[index]?.key ?? index,
	});

	const virtualRows = rowVirtualizer.getVirtualItems();

	const handleScroll = (): void => {
		const lastVirtualIndex = virtualRows.at(-1)?.index ?? -1;
		if (
			lastVirtualIndex >= 0 &&
			hasNextMappingsPage &&
			!isFetchingNextMappingsPage &&
			lastVirtualIndex >= virtualItems.length - LOAD_MORE_THRESHOLD
		) {
			void fetchNextMappingsPage();
		}
	};

	return (
		<div
			ref={listViewportRef}
			onScroll={handleScroll}
			className="h-[68vh] min-h-96 overflow-y-auto pr-1 scrollbar-gutter-stable"
		>
			<div
				className="relative w-full"
				style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
			>
				{virtualRows.map((virtualRow) => {
					const item = virtualItems[virtualRow.index];
					if (!item) return null;
					const needsGroupGap =
						(item.kind === "group" && !item.isExpanded) ||
						(item.kind === "row" && item.isLastInGroup);

					const content =
						item.kind === "group" ? (
							<MappingsProviderGroup
								group={item.group}
								isExpanded={item.isExpanded}
								onToggle={handleToggleGroup}
							/>
						) : (
							<div
								className={cn(
									"border-x border-b border-border-primary bg-bg-secondary/45",
									item.isLastInGroup
										? "rounded-b-md"
										: "border-b-border-primary/40",
								)}
							>
								<MappingsAniListRow
									row={item.row}
									metadata={metadataById.get(item.row.anilistId) ?? null}
									isPending={pendingRowKeys.has(getRowKey(item.row))}
									isHighlighted={targetAniListId === item.row.anilistId}
									preferredTitleLanguage={preferredTitleLanguage}
									onIgnore={handleIgnore}
									onClearMatch={handleClearMatch}
									onEdit={handleEdit}
								/>
							</div>
						);

					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={rowVirtualizer.measureElement}
							className={cn(
								"absolute left-0 top-0 w-full",
								needsGroupGap && "pb-4",
							)}
							style={{
								transform: `translateY(${virtualRow.start}px)`,
							}}
						>
							{content}
						</div>
					);
				})}
			</div>
		</div>
	);
}

const getErrorMessage = (error: unknown): string =>
	normalizeError(error).userMessage;

export function MappingContent(
	props: {
		isInitialLoading: boolean;
		error: Error | ExtensionError | null;
		groupsCount: number;
	} & VirtualizedMappingListProps,
): React.JSX.Element {
	const { isInitialLoading, error, groupsCount, ...virtualizerProps } = props;

	if (isInitialLoading) {
		return (
			<div className="rounded-md border border-border-primary bg-bg-secondary/70 px-4 py-8 text-center text-sm text-text-secondary">
				Loading mappings...
			</div>
		);
	}
	if (error) {
		return (
			<div className="rounded-md border border-error/30 bg-error/10 px-4 py-4 text-sm text-error">
				{getErrorMessage(error)}
			</div>
		);
	}
	if (groupsCount === 0) {
		return (
			<div className="rounded-md border border-dashed border-border-primary bg-bg-secondary/40 px-4 py-8 text-center text-sm text-text-secondary">
				No mappings match current filters.
			</div>
		);
	}
	return <VirtualizedMappingList {...virtualizerProps} />;
}
