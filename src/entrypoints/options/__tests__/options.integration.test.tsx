import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
const settingsFormMock = vi.fn(() => <div data-testid="settings-form">Settings Form</div>);

vi.mock('@/ui/SettingsForm', () => ({
  __esModule: true,
  default: settingsFormMock,
}));

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
  settingsFormMock.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('options entrypoint integration', () => {
  it('renders the options page when the root element exists', async () => {
    const root = document.createElement('div');
    root.id = 'options-root';
    document.body.appendChild(root);

    await act(async () => {
      await import('../index');
    });

    expect(screen.getByRole('heading', { name: 'Kitsunarr' })).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByText('Configure your Sonarr connection and default settings.'),
    ).toBeInstanceOf(HTMLElement);
    expect(screen.getByAltText('Logo')).toBeInstanceOf(HTMLElement);
    expect(screen.getByTestId('settings-form')).toBeInstanceOf(HTMLElement);
    expect(settingsFormMock).toHaveBeenCalled();
  });

  it('does nothing when the root element is missing', async () => {
    await act(async () => {
      await import('../index');
    });

    expect(settingsFormMock).not.toHaveBeenCalled();
  });
});
