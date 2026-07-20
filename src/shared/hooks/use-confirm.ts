/** Hook exposing the shared confirmation dialog action to consumers. */
// src/shared/hooks/use-confirm.ts

import { useContext } from "react";

import { ConfirmContext } from "../ui/feedback/confirm-context";

export function useConfirm() {
	const context = useContext(ConfirmContext);

	if (!context) {
		throw new Error("useConfirm must be used within a ConfirmProvider");
	}

	return context.confirm;
}
