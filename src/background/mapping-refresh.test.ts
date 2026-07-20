/** Tests for background-owned mapping refresh invalidation. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshMappingPipeline } from "./mapping-refresh";

const refreshUpstreamMappingsMock = vi.hoisted(() => vi.fn());
const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/mapping/upstream.store", () => ({
	refreshUpstreamMappings: refreshUpstreamMappingsMock,
}));

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

describe("refreshMappingPipeline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		bumpMappingsRevisionMock.mockResolvedValue("revision");
	});

	it("bumps the mapping revision after mapping facts change", async () => {
		refreshUpstreamMappingsMock.mockResolvedValue(true);

		await expect(refreshMappingPipeline()).resolves.toBe(true);

		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
	});

	it("does not bump the mapping revision when facts are unchanged", async () => {
		refreshUpstreamMappingsMock.mockResolvedValue(false);

		await expect(refreshMappingPipeline()).resolves.toBe(false);

		expect(bumpMappingsRevisionMock).not.toHaveBeenCalled();
	});

	it("does not bump the mapping revision after a failed refresh", async () => {
		const error = new Error("refresh failed");
		refreshUpstreamMappingsMock.mockRejectedValue(error);

		await expect(refreshMappingPipeline()).rejects.toBe(error);

		expect(bumpMappingsRevisionMock).not.toHaveBeenCalled();
	});
});
