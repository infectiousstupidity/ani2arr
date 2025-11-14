import { useEffect } from "react";

import type { FooterState, SetFooterState } from "../components/media-modal";

export function useMediaModalFooter(
  setFooterState: SetFooterState,
  footerState: FooterState,
): void {
  // Footer state is owned by the MediaModal shell; this hook is the
  // intended abstraction for tabs to register/unregister their footer.
  // eslint-disable-next-line react-you-might-not-need-an-effect/no-manage-parent
  useEffect(() => {
    setFooterState(footerState);

    return () => {
      setFooterState(null);
    };
  }, [setFooterState, footerState]);
}
