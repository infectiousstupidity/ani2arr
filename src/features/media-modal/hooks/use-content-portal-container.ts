/** Owns the stable detached portal host used for modal-local floating UI layers. */
// src/features/media-modal/hooks/use-content-portal-container.ts

import { useState } from "react";
import { MODAL_Z_INDEX_FLOATING } from "../chrome/modal-shell";

export function createContentPortalContainer(
	documentRef: Pick<Document, "createElement"> | null,
): HTMLDivElement | null {
	if (!documentRef) {
		return null;
	}

	const element = documentRef.createElement("div") as HTMLDivElement;
	element.style.position = "fixed";
	element.style.inset = "0";
	element.style.zIndex = String(MODAL_Z_INDEX_FLOATING);
	element.style.pointerEvents = "none";
	return element;
}

export function useContentPortalContainer(): HTMLDivElement | null {
	const [container] = useState<HTMLDivElement | null>(() => {
		return typeof document === "undefined"
			? createContentPortalContainer(null)
			: createContentPortalContainer(document);
	});

	return container;
}
