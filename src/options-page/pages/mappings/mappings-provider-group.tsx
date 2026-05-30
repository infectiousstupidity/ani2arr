/** Provider-target group header for the virtualized options mapping list. */
// src/options-page/pages/mappings/mappings-provider-group.tsx

import { ChevronDown, CircleHelp } from "lucide-react";
import { RadarrIcon, SonarrIcon } from "../../components/icons";
import { cn } from "@/shared/utils/cn";
import type {
	MappingGroup,
} from "./mapping-page-model";
import {
	formatMappingGroupLibraryLabel,
	formatMappingGroupMetaLine,
	formatMappingGroupTitle,
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

export function MappingsProviderGroup(
	props: MappingsProviderGroupProps,
): React.JSX.Element {
	const {
		group,
		isExpanded,
		className,
		onToggle,
	} = props;

	return (
		<button
			type="button"
			onClick={() => onToggle(group.key)}
			className={cn(
				"flex min-h-16 w-full items-center gap-4 border border-border-primary bg-bg-tertiary/50 px-4 py-3 text-left transition-colors hover:bg-bg-tertiary/70",
				isExpanded ? "rounded-t-md" : "rounded-md",
				className,
			)}
			aria-expanded={isExpanded}
		>
			<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-primary/60 bg-bg-primary/40 text-text-secondary">
				<ProviderIcon group={group} />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-semibold text-text-primary">
					{formatMappingGroupTitle(group)}
				</span>
				<span className="mt-1 block truncate text-xs text-text-secondary">
					{formatMappingGroupMetaLine(group)}
				</span>
			</span>
			<span className="hidden shrink-0 items-center gap-2 md:flex">
				<span className="rounded border border-border-primary/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
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
		</button>
	);
}
