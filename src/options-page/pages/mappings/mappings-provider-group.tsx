/** Provider-target group header for the options mapping list. */
// src/options-page/pages/mappings/mappings-provider-group.tsx

import { ChevronDown, CircleHelp } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import { RadarrIcon, SonarrIcon } from "@/features/provider-ui/provider-icons";
import { getProviderExternalIdLabel } from "@/providers/provider-labels";
import { getProviderOpenTarget } from "@/providers/provider-links";
import { openProviderPage } from "@/rpc/provider-page";
import Pill from "@/shared/ui/primitives/pill";
import { cn } from "@/shared/utils/cn";
import type {
	MappingGroup,
} from "./mapping-page-model";
import {
	formatMappingGroupLibraryLabel,
	formatMappingGroupTitle,
	getMappingGroupMetaPillLabels,
	isUnmappedMappingGroup,
} from "./mapping-page-model";

interface MappingsProviderGroupProps {
	group: MappingGroup;
	isExpanded: boolean;
	className?: string;
	onToggle: (groupKey: string) => void;
}

const ProviderIcon = ({ group }: { group: MappingGroup }): React.JSX.Element => {
	if (isUnmappedMappingGroup(group)) {
		return <CircleHelp className="h-5 w-5" />;
	}

	if (group.provider === "sonarr") {
		return <SonarrIcon className="h-5 w-5" />;
	}

	return <RadarrIcon className="h-5 w-5" />;
};

const META_PILL_CLASS =
	"border border-border-primary/45 bg-bg-tertiary/20 text-text-secondary normal-case";
const LINK_PILL_CLASS =
	"hover:border-accent-primary/55 hover:bg-accent-primary/15 hover:text-accent-primary focus-visible:border-accent-primary/55 focus-visible:bg-accent-primary/15 focus-visible:text-accent-primary";

const getLibraryPillClass = (group: MappingGroup): string => {
	if (group.isInLibrary === true) {
		return "border-success/35 bg-success/15 text-success";
	}

	if (group.isInLibrary === false) {
		return "border-border-primary/70 bg-bg-tertiary/20 text-text-secondary";
	}

	return "border-warning/35 bg-warning/15 text-warning";
};

export function MappingsProviderGroup(
	props: MappingsProviderGroupProps,
): React.JSX.Element {
	const {
		group,
		isExpanded,
		className,
		onToggle,
	} = props;
	const metaPillLabels = getMappingGroupMetaPillLabels(group);
	const groupTitle = formatMappingGroupTitle(group);
	const providerIdLabel =
		group.providerId === null
			? null
			: `${getProviderExternalIdLabel(group.provider)} ID: ${group.providerId}`;
	const providerMetaPillLabels =
		group.providerId === null ? metaPillLabels : metaPillLabels.slice(1);
	const providerTarget =
		group.providerId === null
			? null
			: getProviderOpenTarget({
					isInLibrary: group.isInLibrary === true,
					providerRouteSlug: group.providerMeta?.providerRouteSlug,
					searchTerm: groupTitle,
				});
	const handleToggleKeyDown = (
		event: KeyboardEvent<HTMLDivElement>,
	): void => {
		if (event.target !== event.currentTarget) return;
		if (event.key !== "Enter" && event.key !== " ") return;

		event.preventDefault();
		onToggle(group.key);
	};
	const handleOpenProvider = (
		event: MouseEvent<HTMLButtonElement>,
	): void => {
		event.stopPropagation();
		if (!event.isTrusted || providerTarget === null) return;

		openProviderPage({ provider: group.provider, target: providerTarget });
	};

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onToggle(group.key)}
			onKeyDown={handleToggleKeyDown}
			className={cn(
				"flex min-h-16 w-full cursor-pointer items-center gap-4 border border-border-primary bg-bg-tertiary/50 px-4 py-3 text-left transition-colors hover:bg-bg-tertiary/70",
				isExpanded ? "rounded-t-md" : "rounded-md",
				className,
			)}
			aria-expanded={isExpanded}
		>
			<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-primary/60 bg-bg-primary/40 text-text-secondary">
				<ProviderIcon group={group} />
			</span>
			<span className="min-w-0 flex-1">
				{providerTarget ? (
					<button
						type="button"
						onClick={handleOpenProvider}
						className="block max-w-full cursor-pointer truncate rounded-sm text-sm font-semibold text-text-primary transition-colors hover:text-accent-primary focus-visible:text-accent-primary"
						aria-label={`Open ${groupTitle}`}
					>
						{groupTitle}
					</button>
				) : (
					<span className="block truncate text-sm font-semibold text-text-primary">
						{groupTitle}
					</span>
				)}
				<span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-text-secondary">
					{providerTarget && providerIdLabel ? (
						<button
							type="button"
							onClick={handleOpenProvider}
							className="cursor-pointer rounded-full"
							aria-label={`Open ${providerIdLabel}`}
						>
							<Pill
								small
								tone="muted"
								className={cn(META_PILL_CLASS, LINK_PILL_CLASS)}
							>
								{providerIdLabel}
							</Pill>
						</button>
					) : null}
					{providerMetaPillLabels.map((label) => (
						<Pill key={label} small tone="muted" className={META_PILL_CLASS}>
							{label}
						</Pill>
					))}
				</span>
			</span>
			<span className="hidden shrink-0 items-center gap-2 md:flex">
				<span
					className={cn(
						"rounded-full border px-2.5 py-1 text-[11px] font-semibold",
						getLibraryPillClass(group),
					)}
				>
					{formatMappingGroupLibraryLabel(group)}
				</span>
				<span className="rounded-full border border-accent-primary/40 bg-accent-primary/15 px-2.5 py-1 text-[11px] font-semibold text-accent-primary">
					{group.rows.length} linked
				</span>
			</span>
			<ChevronDown
				className={cn(
					"h-4 w-4 shrink-0 text-text-secondary transition-transform",
					isExpanded && "rotate-180",
				)}
			/>
		</div>
	);
}
