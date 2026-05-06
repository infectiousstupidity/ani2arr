/** Library presence status vocabulary for mapping and RPC projections. */
// src/mapping/library-status.ts

export type LibraryUnknownReason = "library-check-failed";

export const deriveLibraryUnknownReason = (input: {
	providerMappingState: "mapped" | "unmapped" | "unknown";
	isInLibrary: boolean | null;
	libraryUnknownReason?: LibraryUnknownReason;
}): LibraryUnknownReason | undefined => {
	if (input.providerMappingState !== "mapped" || input.isInLibrary !== null) {
		return undefined;
	}
	return input.libraryUnknownReason ?? "library-check-failed";
};
