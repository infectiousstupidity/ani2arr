/** Owns the shared media modal shell and slot-based layout. */
// src/features/media-modal/modal-body.tsx

import type { ReactNode } from "react";
import type { MediaModalContainer } from "./types";
import { MediaModalProvider } from "./context";
import { Modal, ModalContent } from "./dialog";
import type { Provider } from "@/providers";

const SHELL_CLASS =
  "h-[75.5vh] w-full max-w-250 flex flex-col overflow-hidden rounded-none bg-bg-primary p-0 shadow-2xl shadow-black/40 sm:min-h-180 sm:rounded-2xl";

const FRAME_CLASS = "relative flex-1 overflow-hidden px-4 sm:px-8";
const WORKSPACE_CLASS = "mx-auto flex h-full w-full max-w-250 flex-col";

const PANES_GRID_CLASS =
  "grid h-full min-h-0 grid-cols-1 gap-y-4 lg:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-0 lg:gap-y-2";

const LEFT_PANE_CLASS =
  "order-1 flex h-full flex-col overflow-hidden lg:col-start-1 lg:row-start-2";

const RIGHT_PANE_TOP_CLASS =
  "order-2 flex justify-center lg:col-start-3 lg:row-start-1 lg:items-end";

const RIGHT_PANE_CLASS =
  "order-3 relative min-h-0 lg:col-start-3 lg:row-start-2";

type ModalContentProps = React.ComponentPropsWithoutRef<typeof ModalContent>;

type ModalBodyProps = {
  provider: Provider;
  baseUrl: string;
  container?: MediaModalContainer;
  contentContainer: HTMLDivElement | null;
  header: ReactNode;
  leftPane: ReactNode;
  rightPane: ReactNode;
  footer?: ReactNode;
  rightPaneTop?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onEscapeKeyDown?: ModalContentProps["onEscapeKeyDown"];
};

export function ModalBody(props: ModalBodyProps): React.JSX.Element {
  const {
    provider,
    baseUrl,
    container,
    contentContainer,
    header,
    leftPane,
    rightPane,
    footer,
    rightPaneTop,
    onOpenChange,
    onEscapeKeyDown,
  } = props;

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent
        container={container}
        contentContainer={contentContainer}
        className={SHELL_CLASS}
        onOpenAutoFocus={(event) => event.preventDefault()}
        {...(onEscapeKeyDown ? { onEscapeKeyDown } : {})}
      >
        <MediaModalProvider
          value={{
            provider,
            baseUrl,
            contentContainer: contentContainer,
          }}
        >
          {header}

          <div className={FRAME_CLASS}>
            <div className={WORKSPACE_CLASS}>
              <div className="min-h-0 flex-1 pt-5 pb-4 sm:pt-6">
                <div className={PANES_GRID_CLASS}>
                  <div className={LEFT_PANE_CLASS}>
                    <div className="min-h-0 flex-1">{leftPane}</div>
                  </div>

                  {rightPaneTop ? (
                    <div className={RIGHT_PANE_TOP_CLASS}>{rightPaneTop}</div>
                  ) : null}

                  <div className={RIGHT_PANE_CLASS}>
                    <div className="h-full lg:sticky lg:top-0">{rightPane}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {footer}
        </MediaModalProvider>
      </ModalContent>
    </Modal>
  );
}
