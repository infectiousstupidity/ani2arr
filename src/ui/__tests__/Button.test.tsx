import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const tooltipWrapperMock = vi.fn(({ children }: { children: React.ReactNode }) => <>{children}</>);

vi.mock('../TooltipWrapper', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode }) => tooltipWrapperMock(props),
}));

import Button from '../Button';

describe('Button', () => {
  it('renders a primary button by default', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-accent-primary');
    expect(button).toHaveClass('h-9');
  });

  it('renders loading state with spinner and disables button', () => {
    render(
      <Button isLoading loadingText="Submitting">Submit</Button>,
    );

    const button = screen.getByRole('button', { name: 'Submitting' });
    expect(button).toBeDisabled();
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('wraps content with tooltip when provided', () => {
    render(
      <Button tooltip="Tooltip text" portalContainer={document.body}>
        Hover me
      </Button>,
    );

    expect(tooltipWrapperMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Tooltip text',
        container: document.body,
      }),
    );
  });
});
