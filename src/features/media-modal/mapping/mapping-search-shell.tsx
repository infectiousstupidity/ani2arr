/** Shared explicit search and result list for Sonarr/Radarr mapping panels. */
// src/features/media-modal/mapping/mapping-search-shell.tsx

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Search } from "lucide-react";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import {
	getProviderExternalIdLabel,
	getProviderLabel,
} from "@/providers/provider-labels";
import { getProviderOpenTarget } from "@/providers/provider-links";
import type { Provider } from "@/providers/types";
import { openProviderPage } from "@/rpc/provider-page";
import { normalizeError } from "@/shared/errors/error-utils";
import Button from "@/shared/ui/primitives/button";
import { getLibraryPillLabel } from "../helpers";
import type { MediaModalTargetSummary } from "../types";
import { MappingCandidateRow } from "./mapping-search-results";

/** Props each provider modal passes to its mapping panel. */
export type MappingPanelProps = {
	contentContainer: HTMLDivElement | null;
	currentTarget: MediaModalTargetSummary | null;
	selectedCandidate: MediaModalTargetSummary | null;
	onSelectCandidate: (candidate: MediaModalTargetSummary | null) => void;
};

type MappingSearchShellProps = MappingPanelProps & {
	provider: Provider;
	searchPlaceholder: string;
	hasSearchTerm: boolean;
	isFetching: boolean;
	error: Error | null;
	candidates: MediaModalTargetSummary[];
	/** Receives the submitted term, or "" when the user edits the query. */
	onSearch: (term: string) => void;
};

export function MappingSearchShell(
	props: MappingSearchShellProps,
): React.JSX.Element {
	const {
		provider,
		searchPlaceholder,
		hasSearchTerm,
		isFetching,
		error,
		candidates,
		onSearch,
		contentContainer,
		currentTarget,
		selectedCandidate,
		onSelectCandidate,
	} = props;
	const providerLabel = getProviderLabel(provider);
	const providerIdLabel = getProviderExternalIdLabel(provider);
	const errorMessage = error ? normalizeError(error).userMessage : null;
	const resultCount = candidates.length;
	const [query, setQuery] = useState("");
	const [resultListKey, setResultListKey] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const trimmedQuery = query.trim();
	const canSearch = trimmedQuery.length > 0;
	let stateMessage: string | null = null;
	if (errorMessage) stateMessage = errorMessage;
	else if (isFetching && resultCount === 0) stateMessage = "Searching...";
	else if (hasSearchTerm && resultCount === 0)
		stateMessage = "No results found.";
	const stateMessageClass = errorMessage
		? "border-error/30 bg-error/10 text-error"
		: "border-border-primary/45 bg-bg-secondary/35 text-text-secondary";

	useEffect(() => {
		const searchInput = searchInputRef.current;
		if (!searchInput) return;

		if (typeof requestAnimationFrame !== "function") {
			searchInput.focus();
			return;
		}

		const frameId = requestAnimationFrame(() => searchInput.focus());

		return () => cancelAnimationFrame(frameId);
	}, []);

	const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (!event.isTrusted) return;
		if (!canSearch) return;

		onSearch(trimmedQuery);
		setResultListKey((key) => key + 1);
	};

	const rows = candidates.map((candidate) => {
		const { isInLibrary, providerId, title } = candidate;
		const isSelected = selectedCandidate?.providerId === providerId;

		return (
			<MappingCandidateRow
				key={providerId}
				title={title}
				providerIdLabel={providerIdLabel}
				providerId={providerId}
				contentContainer={contentContainer}
				externalLabel={`Open in ${providerLabel}`}
				openProvider={
					isInLibrary === null
						? undefined
						: () =>
								openProviderPage({
									provider,
									target: getProviderOpenTarget({
										isInLibrary,
										providerRouteSlug: candidate.providerRouteSlug,
										searchTerm: title,
									}),
								})
				}
				isCurrent={currentTarget?.providerId === providerId}
				isSelected={isSelected}
				libraryLabel={
					isInLibrary ? getLibraryPillLabel(candidate, providerLabel) : null
				}
				linkedAniListCount={candidate.linkedAniListIds?.length}
				onToggleSelection={() =>
					onSelectCandidate(isSelected ? null : candidate)
				}
				posterUrl={candidate.posterUrl}
				typeLabel={candidate.typeLabel}
				year={candidate.year}
			/>
		);
	});

	return (
		<div className="flex h-80 min-h-0 flex-col overflow-hidden pt-4 md:h-full">
			<div className="shrink-0 pb-4">
				<p className="text-sm font-semibold leading-none text-text-primary">
					Search {providerLabel} Database
				</p>

				<form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
					<input
						ref={searchInputRef}
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							if (!hasSearchTerm) return;

							onSearch("");
							onSelectCandidate(null);
						}}
						placeholder={searchPlaceholder}
						className="min-w-0 flex-1 rounded-xl border border-border-primary/60 bg-bg-tertiary/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-primary focus:outline-none"
					/>
					<Button
						type="submit"
						size="sm"
						disabled={!canSearch}
						className="h-9 gap-2 rounded-xl px-3"
					>
						<Search size={15} />
						Search
					</Button>
				</form>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden">
				<ScrollArea.Root className="h-full w-full">
					<ScrollArea.Viewport className="h-full w-full overscroll-contain touch-pan-y scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
						<div className="pb-4 pr-3">
							{stateMessage ? (
								<div
									className={`rounded-xl border px-3 py-6 text-center text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${stateMessageClass}`}
								>
									{stateMessage}
								</div>
							) : null}

							{hasSearchTerm && !stateMessage ? (
								<div
									key={resultListKey}
									className="a2a-stagger-list flex flex-col gap-2"
								>
									{rows}
								</div>
							) : null}
						</div>
					</ScrollArea.Viewport>

					<ScrollArea.Scrollbar
						orientation="vertical"
						className="flex w-2.5 select-none touch-none p-0.5"
					>
						<ScrollArea.Thumb className="flex-1 rounded bg-border-primary/40" />
					</ScrollArea.Scrollbar>

					<ScrollArea.Corner />
				</ScrollArea.Root>
			</div>
		</div>
	);
}
