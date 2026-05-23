/** Renders selected provider candidate support details and linked AniList entries in the media modal. */
// src/features/media-modal/details/preview-target-details.tsx

import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { AniListId } from "@/anilist";
import type { MediaModalTargetSummary } from "../types";
import { MappingLinkedEntries } from "./linked-entries";
import { TargetDetailsCard } from "./target-details-card";

type PreviewTargetDetailsProps = {
	aniListEntryId: AniListId;
	previewMapping: MediaModalTargetSummary;
	overwrittenTarget: MediaModalTargetSummary | null;
};

function OverwriteTargetBanner(props: {
	target: MediaModalTargetSummary;
}): React.JSX.Element {
	const { target } = props;

	return (
		<div className="flex max-h-16 min-w-0 items-stretch gap-5 overflow-hidden rounded-r-md border-l-4 border-error bg-error/10 p-3 text-sm">
			<div className="flex self-stretch items-center">
				<AlertTriangle className="h-full max-h-10 w-auto shrink-0 text-error" />
			</div>
			<div className="min-w-0 flex-1 overflow-hidden">
				<p className="truncate font-medium leading-5 text-text-primary">
					This will replace the current mapping:
				</p>
				<p className="truncate leading-5 text-text-secondary line-through opacity-80">
					{target.title}
				</p>
			</div>
		</div>
	);
}

export function PreviewTargetDetails(
	props: PreviewTargetDetailsProps,
): React.JSX.Element {
	const {
		aniListEntryId,
		previewMapping,
		overwrittenTarget,
	} = props;

	return (
		<div className="flex min-h-full flex-col gap-4">
			<TargetDetailsCard mapping={previewMapping} />

			<MappingLinkedEntries
				currentAniListId={aniListEntryId}
				linkedAniListIds={previewMapping.linkedAniListIds ?? []}
			/>

			<LazyMotion features={domAnimation}>
				<AnimatePresence>
					{overwrittenTarget ? (
						<m.div
							key={`${overwrittenTarget.provider}:${overwrittenTarget.providerId}`}
							className="mt-auto pt-4"
							initial={{ opacity: 0, y: 30, scale: 0.95 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 18, scale: 0.98 }}
							transition={{ type: "spring", bounce: 0.4, duration: 0.5 }}
						>
							<OverwriteTargetBanner target={overwrittenTarget} />
						</m.div>
					) : null}
				</AnimatePresence>
			</LazyMotion>
		</div>
	);
}
