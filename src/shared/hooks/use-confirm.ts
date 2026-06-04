// src/shared/hooks/use-confirm.ts
// Exposes the confirmation dialog action to consumers.

import { useContext } from "react";

import { ConfirmContext } from "../ui/feedback/confirm-context";

export function useConfirm() {
	const context = useContext(ConfirmContext);

	if (!context) {
		throw new Error("useConfirm must be used within a ConfirmProvider");
	}

	return context.confirm;
}

export default useConfirm;
