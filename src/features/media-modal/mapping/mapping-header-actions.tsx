/** Renders mapping-mode header actions for the media modal. */
// src/features/media-modal/mapping/mapping-header-actions.tsx

import Button from "@/shared/ui/primitives/button";

interface MappingHeaderActionsProps {
	canRejectCandidate: boolean;
	canClearRejectedCandidate: boolean;
	canIgnoreTitle: boolean;
	isRejectingCandidate: boolean;
	isClearingRejectedCandidate: boolean;
	isIgnoring: boolean;
	onRejectCandidate: () => void | Promise<void>;
	onClearRejectedCandidate: () => void | Promise<void>;
	onIgnoreTitle: () => void | Promise<void>;
}

export function MappingHeaderActions({
	canRejectCandidate,
	canClearRejectedCandidate,
	canIgnoreTitle,
	isRejectingCandidate,
	isClearingRejectedCandidate,
	isIgnoring,
	onRejectCandidate,
	onClearRejectedCandidate,
	onIgnoreTitle,
}: MappingHeaderActionsProps): React.JSX.Element | null {
	if (!canRejectCandidate && !canClearRejectedCandidate && !canIgnoreTitle) {
		return null;
	}

	return (
		<>
			{canRejectCandidate ? (
				<Button
					type="button"
					onClick={() => void onRejectCandidate()}
					variant="outline"
					size="sm"
					className="h-7 rounded-lg px-2 text-xs"
					disabled={isIgnoring || isClearingRejectedCandidate}
					isLoading={isRejectingCandidate}
				>
					Not this match
				</Button>
			) : null}

			{canClearRejectedCandidate ? (
				<Button
					type="button"
					onClick={() => void onClearRejectedCandidate()}
					variant="outline"
					size="sm"
					className="h-7 rounded-lg px-2 text-xs"
					disabled={isIgnoring || isRejectingCandidate}
					isLoading={isClearingRejectedCandidate}
				>
					Clear rejected
				</Button>
			) : null}

			{canIgnoreTitle ? (
				<Button
					type="button"
					onClick={() => void onIgnoreTitle()}
					variant="outline"
					size="sm"
					className="h-7 rounded-lg px-2 text-xs"
					disabled={isRejectingCandidate || isClearingRejectedCandidate}
					isLoading={isIgnoring}
				>
					Ignore title
				</Button>
			) : null}
		</>
	);
}
