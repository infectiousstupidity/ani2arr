/** Seerr request action pane with errors, request scope, and notices. */
// src/features/media-modal/seerr/seerr-request-main-pane.tsx

import type { SeerrRequestTarget } from "@/rpc/types";
import Button from "@/shared/ui/primitives/button";
import type { SeerrRequestScope } from "@/features/seerr-request/seerr-request-scope";

export function SeerrRequestMainPane(props: {
	target: SeerrRequestTarget | null;
	isLoading: boolean;
	errorMessage: string | null;
	canChooseScope: boolean;
	mappedScopeLabel: string;
	selectedScope: SeerrRequestScope;
	requestError: string | null;
	connectionActionLabel: string | null;
	onConnectionAction: () => void;
	onScopeChange: (scope: SeerrRequestScope) => void;
}): React.JSX.Element {
	const {
		target,
		isLoading,
		errorMessage,
		canChooseScope,
		mappedScopeLabel,
		selectedScope,
		requestError,
		connectionActionLabel,
		onConnectionAction,
		onScopeChange,
	} = props;

	return (
		<div className="flex h-80 min-h-0 flex-col overflow-hidden pt-4 md:h-full">
			{errorMessage ? (
				<p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
					{errorMessage}
				</p>
			) : null}

			{requestError ? (
				<p className="mt-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
					{requestError}
				</p>
			) : null}

			{connectionActionLabel ? (
				<div className="mt-3">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onConnectionAction}
					>
						{connectionActionLabel}
					</Button>
				</div>
			) : null}

			{target?.mediaType === "tv" ? (
				<>
					{isLoading ? (
						<p className="mt-3 rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-4 text-sm text-text-secondary">
							Checking Seerr...
						</p>
					) : null}
					{!isLoading && canChooseScope ? (
						<fieldset className="mt-3 rounded-xl border border-border-primary/55 bg-bg-secondary/35 p-3">
							<legend className="px-1 text-xs font-semibold text-text-primary">
								Request scope
							</legend>
							<div className="grid gap-2 sm:grid-cols-2">
								<label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-primary/50 bg-bg-tertiary/35 px-3 py-2 text-sm text-text-primary">
									<input
										type="radio"
										name="seerr-request-scope"
										value="mapped"
										checked={selectedScope === "mapped"}
										onChange={() => onScopeChange("mapped")}
										className="h-4 w-4 accent-accent-primary"
									/>
									<span>{mappedScopeLabel}</span>
								</label>
								<label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-primary/50 bg-bg-tertiary/35 px-3 py-2 text-sm text-text-primary">
									<input
										type="radio"
										name="seerr-request-scope"
										value="all"
										checked={selectedScope === "all"}
										onChange={() => onScopeChange("all")}
										className="h-4 w-4 accent-accent-primary"
									/>
									<span>Request whole series</span>
								</label>
							</div>
						</fieldset>
					) : null}
				</>
			) : (
				<div className="mt-3 rounded-xl border border-border-primary/55 bg-bg-secondary/35 p-4 text-sm text-text-secondary">
					Movie requests use Seerr defaults. Review target, then request.
				</div>
			)}
		</div>
	);
}
