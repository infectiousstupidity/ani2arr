/** Shared overwrite warning banner for media modal mapping flows. */
// src/features/media-modal/mapping/overwrite-target-warning.tsx

import { AlertTriangle } from "lucide-react";
import { cn } from "@/shared/utils/cn";

type OverwriteTargetWarningProps = {
	title: string;
	className?: string | undefined;
};

export function OverwriteTargetWarning(
	props: OverwriteTargetWarningProps,
): React.JSX.Element {
	const { title, className } = props;

	return (
		<div
			className={cn(
				"flex max-h-16 min-w-0 items-stretch gap-5 overflow-hidden rounded-r-md border-l-4 border-error bg-error/10 p-3 text-sm",
				className,
			)}
		>
			<div className="flex self-stretch items-center">
				<AlertTriangle className="h-full max-h-10 w-auto shrink-0 text-error" />
			</div>
			<div className="min-w-0 flex-1 overflow-hidden">
				<p className="truncate font-medium leading-5 text-text-primary">
					This will replace the current mapping:
				</p>
				<p className="truncate leading-5 text-text-secondary opacity-80">
					{title}
				</p>
			</div>
		</div>
	);
}
