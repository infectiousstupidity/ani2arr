/** Background runtime message handling for ping, options opening, and A2A coordination. */
// src/background/runtime-messages.ts

import { browser } from 'wxt/browser';

type OptionsSectionId = 'sonarr' | 'radarr' | 'mappings' | 'ui' | 'advanced';

type OpenOptionsMessage = {
  type: 'OPEN_OPTIONS_PAGE';
  sectionId?: OptionsSectionId;
  targetAnilistId?: number;
};

function isOpenOptionsMessage(x: unknown): x is OpenOptionsMessage {
  return (x as OpenOptionsMessage)?.type === 'OPEN_OPTIONS_PAGE';
}

export const installBackgroundRuntimeMessages = (): void => {
  browser.runtime.onMessage.addListener(
    (message: unknown, sender?: { id?: string }): Promise<unknown> | void => {
      const senderId = (sender as { id?: string } | undefined)?.id;
      const msg = message as { type?: string; timestamp?: number; _a2a?: boolean } | undefined;

      if (senderId !== browser.runtime.id) {
        return;
      }

      if (!msg?._a2a) {
        return;
      }

      if (msg.type === 'a2a:ping') {
        return Promise.resolve({ ok: true as const });
      }

      if (isOpenOptionsMessage(msg)) {
        const open = async (): Promise<void> => {
          try {
            const section =
              msg.sectionId === 'sonarr' ||
              msg.sectionId === 'radarr' ||
              msg.sectionId === 'mappings' ||
              msg.sectionId === 'ui' ||
              msg.sectionId === 'advanced'
                ? msg.sectionId
                : null;

            const baseUrl = browser.runtime.getURL('/options.html');
            const targetHash =
              typeof msg.targetAnilistId === 'number' && Number.isFinite(msg.targetAnilistId)
                ? `?anilistId=${msg.targetAnilistId}`
                : '';

            let url = baseUrl;
            if (section) {
              url = `${baseUrl}#/options/${section}${targetHash}`;
            } else if (targetHash) {
              url = `${baseUrl}#${targetHash}`;
            }

            await browser.tabs.create({ url });
          } catch {
            try {
              await browser.runtime.openOptionsPage();
            } catch {
              // best-effort only
            }
          }
        };

        void open();
        return;
      }
    },
  );
};
