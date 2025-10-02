// src/ui/__tests__/TooltipWrapper.test.tsx
import { render, screen, within, waitFor } from '@testing-library/react';
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
  global.ResizeObserver = ResizeObserverMock;
});

describe('TooltipWrapper', () => {
  it('renders tooltip content inside provided container', async () => {
    const user = userEvent.setup();
    const portalHost = document.createElement('div');
    document.body.appendChild(portalHost);

    render(
      <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
        <TooltipWrapper content="Tooltip text" container={portalHost}>
          <button type="button">Trigger</button>
        </TooltipWrapper>
      </Tooltip.Provider>,
    );

    await user.hover(screen.getByRole('button', { name: 'Trigger' }));

    // Assert by role within the provided portal container.
    await waitFor(() => {
      const tip = within(portalHost).getByRole('tooltip');
      expect(tip).toBeInTheDocument();
      expect(tip).toHaveTextContent('Tooltip text');
    });
  });

  it('provides default help trigger', async () => {
    const user = userEvent.setup();

    render(
      <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
        <HelpTooltip content="Help" />
      </Tooltip.Provider>,
    );

    await user.hover(screen.getByRole('button'));

    // Assert via role to avoid duplicate text nodes
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Help');
  });
});
