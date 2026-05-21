/** Shared explicit-search shell for provider mapping panels. */
// src/features/media-modal/mapping/mapping-search-shell.tsx

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Search } from "lucide-react";
import { useState } from "react";
import Button from "@/shared/ui/primitives/button";

type MappingSearchShellProps = {
	providerLabel: string;
	providerIdLabel: string;
	hasSearchTerm: boolean;
	isFetching: boolean;
	resultCount: number;
	onQueryChange: () => void;
	onSearch: (term: string) => void;
	children: React.ReactNode;
};

export function MappingSearchShell(
	props: MappingSearchShellProps,
): React.JSX.Element {
	const {
		providerLabel,
		providerIdLabel,
		hasSearchTerm,
		isFetching,
		resultCount,
		onQueryChange,
		onSearch,
		children,
	} = props;
	const [query, setQuery] = useState("");
	const trimmedQuery = query.trim();
	const canSearch = trimmedQuery.length > 0;
	let stateMessage: string | null = null;
	if (!hasSearchTerm) stateMessage = "Type a query, then press Search.";
	else if (isFetching && resultCount === 0) stateMessage = "Searching...";
	else if (resultCount === 0) stateMessage = "No results found.";

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (!canSearch) return;

		onSearch(trimmedQuery);
	};

	return (
		<div className="flex flex-col px-4 pt-4 md:h-full md:min-h-0">
			<div className="shrink-0 pb-4">
				<p className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">
					Search {providerLabel} database
				</p>

				<form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
					<input
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							if (hasSearchTerm) onQueryChange();
						}}
						placeholder={`Search ${providerLabel} title or ${providerIdLabel}...`}
						className="min-w-0 flex-1 rounded-xl border border-border-primary/60 bg-bg-tertiary/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-primary focus:outline-none"
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

			<div className="md:min-h-0 md:flex-1 md:overflow-hidden">
				<ScrollArea.Root className="h-full w-full">
					<ScrollArea.Viewport className="h-full w-full scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
						<div className="pb-4 pr-1">
							<div className="overflow-hidden rounded-xl border border-border-primary/60 bg-bg-secondary/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
								<div className="divide-y divide-border-primary/70">
									{stateMessage ? (
										<div className="px-3 py-6 text-center text-xs text-text-secondary">
											{stateMessage}
										</div>
									) : null}

									{hasSearchTerm ? children : null}
								</div>
							</div>
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
