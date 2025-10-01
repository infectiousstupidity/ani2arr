import React, { useRef } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { Modal, ModalContent, ModalDescription, ModalFooter, ModalTitle, ModalTrigger } from '../Modal';

const TestModal: React.FC<{ container?: HTMLElement | null }> = ({ container }) => {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal>
      <ModalTrigger ref={triggerRef} asChild>
        <button type="button">Open</button>
      </ModalTrigger>
      <ModalContent container={container} data-testid="modal-content">
        <ModalTitle data-testid="modal-title">Title</ModalTitle>
        <ModalDescription data-testid="modal-description">Description</ModalDescription>
        <ModalFooter data-testid="modal-footer" className="custom-footer" />
      </ModalContent>
    </Modal>
  );
};

describe('Modal primitives', () => {
  let portalHost: HTMLElement;

  beforeEach(() => {
    portalHost = document.createElement('div');
    document.body.appendChild(portalHost);
  });

  it('renders content inside provided container with overlay', async () => {
    render(<TestModal container={portalHost} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const modalContent = await screen.findByTestId('modal-content');
    expect(modalContent).toBeInTheDocument();
    expect(portalHost.contains(modalContent)).toBe(true);
    expect(modalContent).toHaveStyle({ zIndex: '2147483601' });

    const overlay = await screen.findByTestId('modal-overlay');
    expect(overlay).toHaveStyle({ zIndex: '2147483600' });
  });

  it('applies custom footer class names via clsx helper', () => {
    render(<TestModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const footer = screen.getByTestId('modal-footer');
    expect(footer).toHaveClass('custom-footer');
    expect(screen.getByTestId('modal-title')).toBeInTheDocument();
    expect(screen.getByTestId('modal-description')).toBeInTheDocument();
  });

  it('merges provided styles with enforced z-index', () => {
    render(
      <Modal open onOpenChange={() => {}}>
        <ModalContent data-testid="styled-modal" style={{ maxWidth: '320px' }}>
          <div>Content</div>
        </ModalContent>
      </Modal>,
    );

    const content = screen.getByTestId('styled-modal');
    expect(content).toHaveStyle({ maxWidth: '320px', zIndex: '2147483601' });
  });
});
