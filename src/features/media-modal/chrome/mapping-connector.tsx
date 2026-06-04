/** Center badge connector between media modal source and target cards. */
// src/features/media-modal/chrome/mapping-connector.tsx

import { Check, Link2, Search } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export type MappingConnectorState = "setup" | "search" | "selected";

type MappingConnectorProps = {
	state: MappingConnectorState;
};

const ICON_BY_STATE = {
	setup: Link2,
	search: Search,
	selected: Check,
} as const;

const LABEL_BY_STATE = {
	setup: "Current mapping",
	search: "Search target",
	selected: "Selected target",
} as const;

export function MappingConnector(
	props: MappingConnectorProps,
): React.JSX.Element {
	const { state } = props;
	const Icon = ICON_BY_STATE[state];
	const isSelected = state === "selected";

	return (
		<div className="relative flex h-full w-full shrink-0 items-center justify-center self-stretch">
			<div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-primary" />

			<div
				className={cn(
					"relative z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-bg-primary text-text-secondary transition-colors",
					isSelected
						? "border-accent-primary/45 text-accent-primary"
						: "border-border-primary",
				)}
				aria-label={LABEL_BY_STATE[state]}
				title={LABEL_BY_STATE[state]}
			>
				<span
					key={state}
					className="a2a-connector-icon-in flex h-full w-full items-center justify-center"
				>
					<Icon className="h-4 w-4" />
				</span>
			</div>
		</div>
	);
}
