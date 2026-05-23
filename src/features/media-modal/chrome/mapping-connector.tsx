/** Center badge connector between media modal source and target cards. */
// src/features/media-modal/chrome/mapping-connector.tsx

import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
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
		<LazyMotion features={domAnimation}>
			<div className="relative flex h-full w-full shrink-0 items-center justify-center self-stretch">
				<div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-primary" />

				<m.div
					className={cn(
						"relative z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-bg-tertiary text-text-secondary transition-colors",
						isSelected
							? "border-accent-primary/45 bg-accent-primary/8 text-accent-primary"
							: "border-border-primary",
					)}
					aria-label={LABEL_BY_STATE[state]}
					title={LABEL_BY_STATE[state]}
				>
					<AnimatePresence mode="wait" initial={false}>
						<m.span
							key={state}
							initial={{ opacity: 0, scale: 0.8 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.8 }}
							transition={{ duration: 0.16 }}
							className="flex h-full w-full items-center justify-center"
						>
							<Icon className="h-4 w-4" />
						</m.span>
					</AnimatePresence>
				</m.div>
			</div>
		</LazyMotion>
	);
}
