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
	isMappingGroupExpanded,
	type ClearMatchAction,
	type IgnoreAction,
	type MappingGroup,
	type MappingRow,
} from "./mapping-page-model";

interface MappingListProps {
	groups: readonly MappingGroup[];
	collapsedGroupKeys: ReadonlySet<string>;
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
	groups,
	collapsedGroupKeys,
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
			{groups.map((group) => {
				const isExpanded = isMappingGroupExpanded(
					group,
					collapsedGroupKeys,
					targetAniListId,
				);
				return (
					<div key={group.key} className="mb-4">
						<MappingsProviderGroup
							group={group}
							isExpanded={isExpanded}
							onToggle={handleToggleGroup}
						/>
						{isExpanded
							? group.rows.map((row, index) => (
									<div
										key={getRowKey(row)}
										className={cn(
											"border-x border-b border-border-primary bg-bg-secondary/45",
											index === group.rows.length - 1
												? "rounded-b-md"
												: "border-b-border-primary/40",
										)}
									>
										<MappingsAniListRow
											row={row}
											parentProviderId={group.providerId}
											metadata={metadataById.get(row.anilistId) ?? null}
											isPending={pendingRowKeys.has(getRowKey(row))}
											isHighlighted={targetAniListId === row.anilistId}
											preferredTitleLanguage={preferredTitleLanguage}
											onIgnore={handleIgnore}
											onClearMatch={handleClearMatch}
											onEdit={handleEdit}
										/>
									</div>
								))
							: null}
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
	} & MappingListProps,
): React.JSX.Element {
	const { isInitialLoading, error, groups, ...listProps } = props;

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
	if (groups.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border-primary bg-bg-secondary/40 px-4 py-8 text-center text-sm text-text-secondary">
				No mappings match current filters.
			</div>
		);
	}
	return <MappingList groups={groups} {...listProps} />;
}
