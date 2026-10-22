/** Anime-page presentation for the shared Seerr media action. */

import type { MouseEvent, ReactElement } from "react";
import type { AniListId, AniListMediaHint } from "@/anilist/types";
import { useSeerrMediaAction } from "@/features/media-action/use-seerr-media-action";
import { SeerrIcon } from "@/features/provider-ui/provider-icons";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { SeerrMediaType } from "@/providers/seerr/types";
import Button from "@/shared/ui/primitives/button";

interface SeerrAnimePageActionProps {
	source: SourceIdentity;
	anilistId?: AniListId | undefined;
	title: string | null;
	metadata: AniListMediaHint | null;
	mediaType: SeerrMediaType | null;
	isConfigured: boolean;
	statusBlocked: boolean;
	compact?: boolean;
	portalContainer?: HTMLElement | undefined;
	onOpenModal(): void;
}

function isTrustedClick(event: MouseEvent<HTMLButtonElement>): boolean {
	return event.nativeEvent.isTrusted === true || event.isTrusted === true;
}

export function SeerrAnimePageAction({
	source,
	anilistId,
	title,
	metadata,
	mediaType,
	isConfigured,
	statusBlocked,
	compact = false,
	portalContainer,
	onOpenModal,
}: SeerrAnimePageActionProps): ReactElement {
	const action = useSeerrMediaAction({
		source,
		...(anilistId === undefined ? {} : { anilistId }),
		title,
		metadata,
		mediaType,
		isConfigured,
		enabled: true,
		statusBlocked,
		onOpenModal,
	});
	const hasOpenAction = action.openProvider !== null;

	const handlePrimaryClick = (event: MouseEvent<HTMLButtonElement>): void => {
		if (!isTrustedClick(event)) return;
		action.runPrimaryAction();
	};

	const handleOpenClick = (event: MouseEvent<HTMLButtonElement>): void => {
		if (!isTrustedClick(event)) return;
		action.openProvider?.();
	};

	return (
		<div
			className={`grid ${
				hasOpenAction
					? `grid-cols-[1fr_auto] ${compact ? "gap-2" : "gap-3.75"}`
					: "grid-cols-1 gap-0"
			} w-full items-start`}
		>
			<Button
				type="button"
				size="sm"
				variant="primary"
				onClick={handlePrimaryClick}
				disabled={action.status.disabled}
				tooltip={action.visualTitle}
				tooltipContainer={portalContainer}
				className={`${compact ? "h-6.5 text-[11px]" : "h-8.75 text-[14px]"} w-full rounded-[3px]`}
			>
				<span className="inline-flex min-w-0 items-center justify-center gap-2">
					<span className="truncate">{action.visualTitle}</span>
				</span>
			</Button>
			{hasOpenAction ? (
				<Button
					type="button"
					size="icon"
					variant="primary"
					tooltip="Open in Seerr"
					tooltipContainer={portalContainer}
					className={`${compact ? "h-6.5 w-6.5" : "h-8.75 w-8.75"} rounded-[3px]`}
					onClick={handleOpenClick}
				>
					<SeerrIcon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
				</Button>
			) : null}
		</div>
	);
}
