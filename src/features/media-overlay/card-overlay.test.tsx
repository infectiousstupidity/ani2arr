/** Focused markup tests for browse-card action presentations. */

import * as Tooltip from "@radix-ui/react-tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardOverlay } from "./card-overlay";

function ProviderIcon(): React.ReactElement {
	return <svg data-provider-icon="sonarr" />;
}

describe("CardOverlay", () => {
	it("renders ordered status-column text actions in a dropdown", () => {
		const view = renderToStaticMarkup(
			<Tooltip.Provider>
				<CardOverlay
					providerLabel="Sonarr"
					primaryState="in-library"
					primaryTitle="Already in Sonarr"
					primaryLabel="In Sonarr"
					primaryDisabled={true}
					statusPrimaryDisabled={false}
					onPrimaryAction={() => {}}
					onStatusPrimaryAction={() => {}}
					hasMapping={true}
					onOpenSetup={() => {}}
					onOpenMapping={() => {}}
					openProvider={() => {}}
					openProviderIcon={ProviderIcon}
					extraAction={<span>Configure Seerr</span>}
					presentation="status-column"
				/>
			</Tooltip.Provider>,
		);

		expect(view).toContain('data-presentation="status-column"');
		expect(view).toContain("a2a-card-overlay__status-primary");
		expect(view).not.toContain("a2a-card-overlay__quick");
		expect(view).not.toContain("a2a-card-overlay__stack");
		expect(view).toContain('aria-label="Sonarr actions"');
		expect(view).not.toContain("a2a-card-overlay__status-external");
		expect(view).not.toContain('data-provider-icon="sonarr"');
		expect(view.indexOf("In Sonarr")).toBeLessThan(
			view.indexOf("Configure Seerr"),
		);
	});

	it("renders an action row without circular or stacked controls", () => {
		const view = renderToStaticMarkup(
			<Tooltip.Provider>
				<CardOverlay
					providerLabel="Sonarr"
					primaryState="in-library"
					primaryTitle="Already in Sonarr"
					primaryLabel="In Sonarr"
					primaryDisabled={true}
					statusPrimaryDisabled={false}
					onPrimaryAction={() => {}}
					onStatusPrimaryAction={() => {}}
					hasMapping={true}
					onOpenSetup={() => {}}
					onOpenMapping={() => {}}
					openProvider={() => {}}
					openProviderIcon={ProviderIcon}
					extraAction={<span>Configure Seerr</span>}
					presentation="action-row"
				/>
			</Tooltip.Provider>,
		);

		expect(view).toContain('data-presentation="action-row"');
		expect(view).toContain("a2a-card-overlay__row-primary");
		expect(view).toContain("a2a-card-overlay__row-external");
		expect(view).toContain('aria-label="Already in Sonarr"');
		expect(view).toContain('aria-label="Open in Sonarr"');
		expect(view).toContain('data-provider-icon="sonarr"');
		expect(view).not.toContain("a2a-card-overlay__quick");
		expect(view).not.toContain("a2a-card-overlay__stack");
		expect(view).not.toContain("a2a-card-overlay__menu-trigger");
		expect(view.indexOf("In Sonarr")).toBeLessThan(
			view.indexOf("Configure Seerr"),
		);
	});
});
