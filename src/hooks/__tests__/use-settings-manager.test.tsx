import { describe, it, expect, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import {
  renderUseSettingsManager,
  createOptions,
  validUrl,
  validUrlWithBasePath,
  validApiKey,
  alternateUrl,
  removalErrorMessage,
  setExtensionOptionsSnapshotMock,
  setMockExtensionOptionsValue,
  pushMockExtensionOptionsUpdate,
  kitsunarrApiMock,
  validateUrlMock,
  validateApiKeyMock,
  requestSonarrPermissionMock,
  buildSonarrPermissionPatternSpy,
} from './use-settings-manager/test-harness';
import { queryKeys } from '@/hooks/use-api-queries';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  createSonarrQualityProfileFixture,
  createSonarrRootFolderFixture,
} from '@/testing/fixtures/sonarr';
import {
  createSonarrQualityProfileHandler,
  createSonarrRootFolderHandler,
  withLatency,
} from '@/testing/msw-server';
import { testServer, createSonarrDefaultsFixture } from '@/testing';
import type { SonarrFormState, SonarrQualityProfile, SonarrRootFolder } from '@/types';
describe('useSettingsManager', () => {
  it('auto-fills Sonarr defaults from metadata and refetches on refresh', async () => {
    const qualityProfile = createSonarrQualityProfileFixture({ id: 42, name: 'UltraHD' });
    const rootFolder = createSonarrRootFolderFixture({ path: '/anime/custom' });

    testServer.use(
      createSonarrQualityProfileHandler({
        profiles: [qualityProfile],
        ...withLatency<SonarrQualityProfile[]>(50),
      }),
      createSonarrRootFolderHandler({
        folders: [rootFolder],
        ...withLatency<SonarrRootFolder[]>(50),
      }),
    );

    setMockExtensionOptionsValue(
      createOptions({
        sonarrUrl: validUrl,
        sonarrApiKey: validApiKey,
        defaults: createSonarrDefaultsFixture({ qualityProfileId: '', rootFolderPath: '' }),
      }),
    );

    const { result, queryClient } = renderUseSettingsManager();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(kitsunarrApiMock.testConnection).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.sonarrMetadata.isSuccess).toBe(true));

    expect(result.current.formState.defaults.qualityProfileId).toBe(qualityProfile.id);
    expect(result.current.formState.defaults.rootFolderPath).toBe(rootFolder.path);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      result.current.handleRefresh();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.sonarrMetadata(`${validUrl}|${validApiKey}`),
    });

    await waitFor(() => expect(kitsunarrApiMock.getSonarrMetadata).toHaveBeenCalledTimes(2));
  });

  it('does not refresh metadata when connection has not been established', async () => {
    const { result, queryClient } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      result.current.handleRefresh();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('validates inputs and requests permission before testing connection', async () => {
    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrlWithBasePath);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleTestConnection();
    });

    expect(validateUrlMock).toHaveBeenCalledWith(validUrlWithBasePath);
    expect(validateApiKeyMock).toHaveBeenCalledWith(validApiKey);
    expect(requestSonarrPermissionMock).toHaveBeenCalledWith(validUrlWithBasePath);
    expect(kitsunarrApiMock.testConnection).toHaveBeenCalledWith({
      url: validUrlWithBasePath,
      apiKey: validApiKey,
    });
  });

  it('skips connection test when validation fails', async () => {
    validateUrlMock.mockReturnValueOnce({ isValid: false });

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', 'notaurl');
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleTestConnection();
    });

    expect(requestSonarrPermissionMock).not.toHaveBeenCalled();
    expect(kitsunarrApiMock.testConnection).not.toHaveBeenCalled();
  });

  it('skips connection test when permission is denied', async () => {
    requestSonarrPermissionMock.mockResolvedValueOnce({ granted: false });

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrl);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleTestConnection();
    });

    expect(kitsunarrApiMock.testConnection).not.toHaveBeenCalled();
  });

  it('resets the connection state', async () => {
    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrl);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleTestConnection();
    });

    await waitFor(() => expect(result.current.testConnectionState.isSuccess).toBe(true));

    await act(async () => {
      result.current.resetConnection();
    });

    await waitFor(() => expect(result.current.testConnectionState.isSuccess).toBe(false));
    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });

  it('does not attempt to save when the form is pristine', async () => {
    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleSave();
    });

    expect(requestSonarrPermissionMock).not.toHaveBeenCalled();
    expect(setExtensionOptionsSnapshotMock).not.toHaveBeenCalled();
  });

  it('aborts save when validation fails', async () => {
    validateUrlMock.mockReturnValueOnce({ isValid: false });

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', 'bad-url');
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(requestSonarrPermissionMock).not.toHaveBeenCalled();
    expect(kitsunarrApiMock.testConnection).not.toHaveBeenCalled();
    expect(setExtensionOptionsSnapshotMock).not.toHaveBeenCalled();
  });

  it('aborts save when permission is denied', async () => {
    requestSonarrPermissionMock.mockResolvedValueOnce({ granted: false });

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrlWithBasePath);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(kitsunarrApiMock.testConnection).not.toHaveBeenCalled();
    expect(setExtensionOptionsSnapshotMock).not.toHaveBeenCalled();
  });

  it('does not persist settings when the connection test fails', async () => {
    kitsunarrApiMock.testConnection.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrlWithBasePath);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(setExtensionOptionsSnapshotMock).not.toHaveBeenCalled();
    expect(kitsunarrApiMock.notifySettingsChanged).not.toHaveBeenCalled();
  });

  it('saves settings after successful validation, permission, and connection test', async () => {
    const { result, queryClient } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrlWithBasePath);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(kitsunarrApiMock.testConnection).toHaveBeenCalled());
    await waitFor(() =>
      expect(setExtensionOptionsSnapshotMock).toHaveBeenCalledWith({
        sonarrUrl: validUrlWithBasePath,
        sonarrApiKey: validApiKey,
        defaults: createSonarrDefaultsFixture(),
      }),
    );
    await waitFor(() => expect(kitsunarrApiMock.notifySettingsChanged).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.options() }),
    );
  });

  it('tracks dirtiness against merged defaults and resets when saved state matches', async () => {
    const partialDefaults = {
      qualityProfileId: 7,
      rootFolderPath: '/existing',
    } as unknown as SonarrFormState;

    setMockExtensionOptionsValue(
      createOptions({
        sonarrUrl: validUrl,
        sonarrApiKey: validApiKey,
        defaults: partialDefaults,
      }),
    );

    const { result } = renderUseSettingsManager();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.formState.defaults.seriesType).toBe('anime');
    expect(result.current.isDirty).toBe(false);

    await act(async () => {
      result.current.handleDefaultsChange('qualityProfileId', 25);
    });

    await waitFor(() => expect(result.current.isDirty).toBe(true));

    await act(async () => {
      pushMockExtensionOptionsUpdate(result.current.formState);
    });

    await waitFor(() => expect(result.current.isDirty).toBe(false));
  });

  it('removes previous host permissions when the Sonarr URL changes', async () => {
    const previousUrl = 'https://legacy-sonarr.test:8989/subpath';
    const removeSpy = vi
      .spyOn(fakeBrowser.permissions, 'remove')
      .mockResolvedValue(true);

    setMockExtensionOptionsValue(
      createOptions({ sonarrUrl: previousUrl, sonarrApiKey: validApiKey }),
    );

    const { result } = renderUseSettingsManager();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', alternateUrl);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(removeSpy).toHaveBeenCalledWith({ origins: ['https://legacy-sonarr.test:8989/subpath/*'] });
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(requestSonarrPermissionMock).toHaveBeenCalledWith(alternateUrl);
    expect(buildSonarrPermissionPatternSpy).toHaveBeenCalledWith(previousUrl);
    expect(buildSonarrPermissionPatternSpy).toHaveBeenCalledWith(alternateUrl);
    expect(result.current.saveError).toBeNull();

    removeSpy.mockRestore();
  });

  it('aborts saving, rolls back settings, and reports an error when host permission removal fails', async () => {
    const previousUrl = 'https://legacy-sonarr.test';
    const removeSpy = vi
      .spyOn(fakeBrowser.permissions, 'remove')
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);

    setMockExtensionOptionsValue(
      createOptions({ sonarrUrl: previousUrl, sonarrApiKey: validApiKey }),
    );

    const { result } = renderUseSettingsManager();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', alternateUrl);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(requestSonarrPermissionMock).toHaveBeenCalledWith(alternateUrl));
    await waitFor(() => expect(setExtensionOptionsSnapshotMock).toHaveBeenCalledTimes(2));
    expect(setExtensionOptionsSnapshotMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sonarrUrl: alternateUrl,
        sonarrApiKey: validApiKey,
      }),
    );
    expect(setExtensionOptionsSnapshotMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sonarrUrl: previousUrl,
        sonarrApiKey: validApiKey,
      }),
    );
    expect(removeSpy).toHaveBeenNthCalledWith(1, { origins: ['https://legacy-sonarr.test/*'] });
    expect(removeSpy).toHaveBeenNthCalledWith(2, { origins: ['https://new-sonarr.test/app/*'] });
    expect(result.current.saveError).toBe(removalErrorMessage);
    expect(result.current.formState.sonarrUrl).toBe(previousUrl);

    removeSpy.mockRestore();
  });

  it('aborts saving, rolls back settings, and reports an error when host permission removal throws', async () => {
    const previousUrl = 'https://legacy-sonarr.test';
    const removeSpy = vi
      .spyOn(fakeBrowser.permissions, 'remove')
      .mockRejectedValueOnce(new Error('remove failed'))
      .mockResolvedValue(true);

    setMockExtensionOptionsValue(
      createOptions({ sonarrUrl: previousUrl, sonarrApiKey: validApiKey }),
    );

    const { result } = renderUseSettingsManager();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', alternateUrl);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(requestSonarrPermissionMock).toHaveBeenCalledWith(alternateUrl));
    await waitFor(() => expect(setExtensionOptionsSnapshotMock).toHaveBeenCalledTimes(2));
    expect(setExtensionOptionsSnapshotMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sonarrUrl: alternateUrl,
        sonarrApiKey: validApiKey,
      }),
    );
    expect(setExtensionOptionsSnapshotMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sonarrUrl: previousUrl,
        sonarrApiKey: validApiKey,
      }),
    );
    expect(removeSpy).toHaveBeenNthCalledWith(1, { origins: ['https://legacy-sonarr.test/*'] });
    expect(removeSpy).toHaveBeenNthCalledWith(2, { origins: ['https://new-sonarr.test/app/*'] });
    expect(result.current.saveError).toBe(removalErrorMessage);
    expect(result.current.formState.sonarrUrl).toBe(previousUrl);

    removeSpy.mockRestore();
  });

  it('skips host permission removal when the Sonarr URL is unchanged', async () => {
    const removeSpy = vi.spyOn(fakeBrowser.permissions, 'remove');
    const updatedApiKey = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    setMockExtensionOptionsValue(
      createOptions({ sonarrUrl: validUrl, sonarrApiKey: validApiKey }),
    );

    const { result } = renderUseSettingsManager();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrApiKey', updatedApiKey);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(removeSpy).not.toHaveBeenCalled();
    expect(requestSonarrPermissionMock).toHaveBeenCalledWith(validUrl);
    expect(result.current.saveError).toBeNull();
  });
});
