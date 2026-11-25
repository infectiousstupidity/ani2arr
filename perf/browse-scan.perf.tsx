// @vitest-environment happy-dom
/** Browse observer cost: scans and card parses per mount and per mutation. */
import { act, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, it } from "vitest";
import { anilistBrowseAdapter } from "@/content/anilist/browse/adapter";
import type { BrowseAdapter } from "@/content/browse/types";
import {
	scanBrowseCardTargets,
	useBrowseCardTargets,
} from "@/content/browse/use-browse-card-targets";
import { buildAniListCards, report, time } from "./helpers";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function buildGrid(cards: number): HTMLElement {
	const grid = document.createElement("div");
	grid.className = "media-grid";
	grid.append(...buildAniListCards(1, cards));
	document.body.replaceChildren(grid);
	return grid;
}

const frame = () => new Promise((resolve) => setTimeout(resolve, 30));

let bump: (() => void) | null = null;
function Overlays({ adapter }: { adapter: BrowseAdapter }): ReactElement {
	const targets = useBrowseCardTargets(adapter, true);
	const [tick, setTick] = useState(0);
	bump = () => setTick((value) => value + 1);
	return (
		<>
			{targets.map((target) =>
				createPortal(
					<button type="button">status {tick}</button>,
					target.container,
					target.key,
				),
			)}
		</>
	);
}

describe("browse scan", () => {
	for (const cards of [50, 200]) {
		it(`${cards} cards`, async () => {
			buildGrid(cards);
			await time(
				`scanBrowseCardTargets (${cards} cards)`,
				() => scanBrowseCardTargets({ adapter: anilistBrowseAdapter }),
				9,
			);

			const grid = buildGrid(cards);
			let parses = 0;
			let scans = 0;
			const adapter: BrowseAdapter = {
				...anilistBrowseAdapter,
				getScanRoot: () => {
					scans += 1;
					return anilistBrowseAdapter.getScanRoot?.() ?? null;
				},
				parseCard: (card) => {
					parses += 1;
					return anilistBrowseAdapter.parseCard(card);
				},
			};
			const host = document.createElement("div");
			document.body.append(host);
			const root = createRoot(host);
			await act(async () => root.render(<Overlays adapter={adapter} />));
			for (let index = 0; index < 5; index += 1) await act(frame);
			report(`${cards} cards: mount -> scans / parses`, `${scans} / ${parses}`);

			scans = 0;
			parses = 0;
			await act(async () => {
				const airing = grid.querySelector(".airing")!;
				airing.firstChild!.textContent = "Ep 3 airing in 1 day";
				await frame();
			});
			for (let index = 0; index < 3; index += 1) await act(frame);
			report(
				`${cards} cards: one host text change -> scans / parses`,
				`${scans} / ${parses}`,
			);

			scans = 0;
			parses = 0;
			await act(async () => {
				bump?.();
				await frame();
			});
			for (let index = 0; index < 3; index += 1) await act(frame);
			report(
				`${cards} cards: one overlay re-render -> scans / parses`,
				`${scans} / ${parses}`,
			);

			scans = 0;
			parses = 0;
			await act(async () => {
				grid.append(...buildAniListCards(10_001, 10_000 + cards));
				await frame();
			});
			for (let index = 0; index < 5; index += 1) await act(frame);
			report(
				`${cards} cards: append ${cards} more (infinite scroll) -> scans / parses`,
				`${scans} / ${parses}`,
			);
			await act(async () => root.unmount());
		});
	}
});
