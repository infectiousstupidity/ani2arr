/** Direct mapping list renderer and loading states for the options page. */
// src/options-page/pages/mappings/mappings-list.tsx

import type { AniListId, AniListMetadata } from "@/anilist/types";
import type { AniListTitleLanguage } from "@/anilist/title";
import { normalizeError } from "@/shared/errors/error-utils";
import type { ExtensionError } from "@/shared/errors/error.types";
import { cn } from "@/shared/utils/cn";
import { MappingsAniListRow } from "./mappings-anilist-row";
import { MappingsProviderGroup } from "./mappings-provider-group";
import {
	getRowKey,
	type ClearMatchAction,
	type IgnoreAction,
	type MappingListItem,
	type MappingRow,
} from "./mapping-page-model";

interface MappingListProps {
	items: readonly MappingListItem[];
	metadataById: ReadonlyMap<number, AniListMetadata>;
	pendingRowKeys: Set<string>;
	targetAniListId: AniListId | null;
	preferredTitleLanguage: AniListTitleLanguage;
	handleToggleGroup: (groupKey: string) => void;
	handleIgnore: (row: MappingRow, action: IgnoreAction) => void;
	handleClearMatch: (row: MappingRow, action: ClearMatchAction) => void;
	handleEdit: (row: MappingRow) => void;
}

function MappingList({
	items,
	metadataById,
	pendingRowKeys,
	targetAniListId,
	preferredTitleLanguage,
	handleToggleGroup,
	handleIgnore,
	handleClearMatch,
	handleEdit,
}: MappingListProps): React.JSX.Element {
	return (
		<div>
			{items.map((item) => {
				if (item.kind === "group") {
					return (
						<div key={item.key} className={cn(!item.isExpanded && "mb-4")}>
							<MappingsProviderGroup
								group={item.group}
								isExpanded={item.isExpanded}
								onToggle={handleToggleGroup}
							/>
						</div>
					);
				}

				return (
					<div
						key={item.key}
						className={cn(
							"border-x border-b border-border-primary bg-bg-secondary/45",
							item.isLastInGroup
								? "mb-4 rounded-b-md"
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
			})}
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
	} & MappingListProps,
): React.JSX.Element {
	const { isInitialLoading, error, groupsCount, ...listProps } = props;

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
	return <MappingList {...listProps} />;
}
