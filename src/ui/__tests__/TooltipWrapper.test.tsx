import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import * as Tooltip from '@radix-ui/react-tooltip';

import TooltipWrapper, { HelpTooltip } from '../TooltipWrapper';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error - assign mock
  global.ResizeObserver = ResizeObserverMock;
});

describe('TooltipWrapper', () => {
  it('renders tooltip content inside provided container', async () => {
    const user = userEvent.setup();
    const portalHost = document.createElement('div');
    document.body.appendChild(portalHost);

    render(
      <Tooltip.Provider>
        <TooltipWrapper content="Tooltip text" container={portalHost}>
          <button type="button">Trigger</button>
        </TooltipWrapper>
      </Tooltip.Provider>,
    );

    await user.hover(screen.getByRole('button', { name: 'Trigger' }));

    await screen.findAllByText('Tooltip text');
    expect(portalHost.textContent).toContain('Tooltip text');
  });

  it('provides default help trigger', async () => {
    const user = userEvent.setup();

    render(
      <Tooltip.Provider>
        <HelpTooltip content="Help" />
      </Tooltip.Provider>,
    );

    const trigger = screen.getByRole('button');
    await user.hover(trigger);
    const helpMessages = await screen.findAllByText('Help');
    expect(helpMessages.length).toBeGreaterThan(0);
  });
});
