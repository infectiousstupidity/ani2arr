import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SonarrFormState } from '@/types';

type SonarrMetadataData = {
  qualityProfiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string }[];
  tags: { id: number; label: string }[];
} | null;

type Manager = {
  isLoading: boolean;
  isConnected: boolean;
  isDirty: boolean;
  formState: {
    sonarrUrl: string;
    sonarrApiKey: string;
    defaults: SonarrFormState;
  };
  handleFieldChange: (field: string, value: unknown) => void;
  handleTestConnection: () => void;
  handleRefresh: () => void;
  handleDefaultsChange: (key: string, value: unknown) => void;
  handleSave: () => void;
  resetConnection: () => void;
  testConnectionState: {
    isError: boolean;
    isPending: boolean;
    isSuccess: boolean;
  };
  sonarrMetadata: {
    isFetching: boolean;
    isRefetching: boolean;
    data: SonarrMetadataData;
  };
  saveState: {
    isPending: boolean;
  };
};

const handleTestConnection = vi.fn();
const handleFieldChange = vi.fn();
const handleRefresh = vi.fn();
const handleDefaultsChange = vi.fn();
const handleSave = vi.fn();
const resetConnection = vi.fn();

const defaultFormState: SonarrFormState = {
  qualityProfileId: 1,
  rootFolderPath: '/media',
  seriesType: 'standard',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  tags: [],
};

const baseManager = (): Manager => ({
  isLoading: false,
  isConnected: false,
  isDirty: false,
  formState: {
    sonarrUrl: 'http://localhost:8989',
      sonarrApiKey: '0123456789abcdef0123456789abcdef',
    defaults: defaultFormState,
  },
  handleFieldChange,
  handleTestConnection,
  handleRefresh,
  handleDefaultsChange,
  handleSave,
  resetConnection,
  testConnectionState: {
    isError: false,
    isPending: false,
    isSuccess: false,
  },
  sonarrMetadata: {
    isFetching: false,
    isRefetching: false,
    data: {
      qualityProfiles: [
        { id: 1, name: 'HD-1080p' },
      ],
      rootFolders: [
        { id: 1, path: '/media' },
      ],
      tags: [
        { id: 5, label: 'Anime' },
      ],
    },
  },
  saveState: {
    isPending: false,
  },
});

const createManager = (overrides: Partial<Manager> = {}): Manager => ({
  ...baseManager(),
  ...overrides,
});

const useSettingsManagerMock = vi.fn(() => createManager());

vi.mock('@/hooks/use-settings-manager', () => ({
  __esModule: true,
  useSettingsManager: () => useSettingsManagerMock(),
}));

vi.mock('../TooltipWrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SettingsForm from '../SettingsForm';

beforeEach(() => {
  useSettingsManagerMock.mockImplementation(() => createManager());
});

afterEach(() => {
  vi.clearAllMocks();
  useSettingsManagerMock.mockReset();
  useSettingsManagerMock.mockImplementation(() => createManager());
});

describe('SettingsForm', () => {
  it('renders loading state', () => {
    useSettingsManagerMock.mockImplementation(() => createManager({ isLoading: true }));

    render(<SettingsForm />);

    expect(screen.getByText('Loading settings...')).toBeInTheDocument();
  });

  it('submits test connection when not connected and handles retry label', () => {
    useSettingsManagerMock.mockImplementation(() =>
      createManager({
        testConnectionState: {
          isError: true,
          isPending: false,
          isSuccess: false,
        },
      }),
    );

    render(<SettingsForm />);

    const form = screen.getByText('Sonarr Connection').closest('form');
    fireEvent.submit(form!);
    expect(handleTestConnection).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    const urlInput = screen.getByLabelText('Sonarr URL') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'http://new-url' } });
    expect(handleFieldChange).toHaveBeenCalledWith('sonarrUrl', 'http://new-url');
  });

  it('shows connected state with defaults form and refresh button', async () => {
    useSettingsManagerMock.mockImplementation(() =>
      createManager({
        isConnected: true,
        isDirty: true,
        testConnectionState: {
          isError: false,
          isPending: false,
          isSuccess: true,
        },
        sonarrMetadata: {
          isFetching: false,
          isRefetching: false,
          data: baseManager().sonarrMetadata.data,
        },
      }),
    );

    const user = userEvent.setup();

    render(<SettingsForm />);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    const connectionForm = screen.getByText('Sonarr Connection').closest('form');
    fireEvent.submit(connectionForm!);
    expect(handleTestConnection).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(handleSave).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByRole('button', { name: 'Refresh data from Sonarr' });
    await user.click(refreshButton);
    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('skips connection attempts while pending', () => {
    useSettingsManagerMock.mockImplementation(() =>
      createManager({
        isConnected: false,
        testConnectionState: {
          isError: false,
          isPending: true,
          isSuccess: false,
        },
      }),
    );

    render(<SettingsForm />);

    const form = screen.getByText('Sonarr Connection').closest('form');
    fireEvent.submit(form!);
    expect(handleTestConnection).not.toHaveBeenCalled();
  });

  it('displays loading fallback when Sonarr metadata is fetching', () => {
    useSettingsManagerMock.mockImplementation(() =>
      createManager({
        isConnected: true,
        sonarrMetadata: {
          isFetching: true,
          isRefetching: false,
          data: null,
        },
      }),
    );

    render(<SettingsForm />);

    expect(screen.getByText('Loading Sonarr data...')).toBeInTheDocument();
  });

  it('omits defaults form when Sonarr metadata is unavailable', () => {
    useSettingsManagerMock.mockImplementation(() =>
      createManager({
        isConnected: true,
        sonarrMetadata: {
          isFetching: false,
          isRefetching: false,
          data: null,
        },
      }),
    );

    render(<SettingsForm />);

    expect(screen.getByText('Default Options')).toBeInTheDocument();
    expect(screen.queryByText('Quality Profile')).not.toBeInTheDocument();
  });
});
