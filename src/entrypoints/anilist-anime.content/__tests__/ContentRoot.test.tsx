import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { getReactHandler } from '@/testing';
import {
  alertMock,
  browserMocks,
  renderContentRoot,
  configuredOptions,
  setExtensionOptionsSnapshot,
  __resetTestApi,
  __getTestApiSpies,
  findActionButton,
  testServer,
  createStaticMappingHandler,
  createStaticMappingPayload,
  createAniListHandlers,
  createAniMediaFixture,
  createSonarrLookupHandler,
  createSonarrLookupFixture,
  createSonarrSeriesHandler,
  createSonarrAddSeriesHandler,
} from './content-root/test-harness';
describe('ContentRoot', () => {
  it('alerts and opens options when quick add is attempted without configuration', async () => {
    const { user } = renderContentRoot();

    const quickAddButton = await findActionButton();

    const onClick = getReactHandler(quickAddButton, 'onClick') as ((ev: Event) => void) | null;
    if (onClick) {
      onClick({ preventDefault: () => {}, stopPropagation: () => {} } as unknown as Event);
    } else {
      // Fallback to user click (for non-disabled button)
      await user.click(quickAddButton);
    }

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Please configure your Sonarr settings first.'));
    expect(browserMocks.openOptionsPageMock).toHaveBeenCalledTimes(1);
  });

  it('transitions to "In Sonarr" after a successful quick add', async () => {
    await setExtensionOptionsSnapshot(configuredOptions);
    __resetTestApi();

    testServer.use(
      createSonarrSeriesHandler({ series: [] }),
      createSonarrAddSeriesHandler(),
    );

    const { user } = renderContentRoot();

    await waitFor(() => expect(__getTestApiSpies().getSeriesStatus).toHaveBeenCalled());

    const quickAddButton = await screen.findByRole('button', { name: 'Add to Sonarr' });
    await user.click(quickAddButton);

    await screen.findByRole('button', { name: 'In Sonarr' });
    expect(browserMocks.sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'series-updated' }),
    );
  });

  it('opens and closes the advanced options modal', async () => {
    await setExtensionOptionsSnapshot(configuredOptions);
    __resetTestApi();

    const { user } = renderContentRoot();

    const gearButton = await screen.findByRole('button', { name: 'Advanced options' });

    // If the gear is disabled (for example the series is already in Sonarr),
    // call the internal React onClick directly to open the modal (mirrors
    // other tests' approach when DOM buttons are disabled).
    const onClick = getReactHandler(gearButton, 'onClick') as ((ev: Event) => void) | null;
    if (onClick) {
      onClick({ preventDefault: () => {}, stopPropagation: () => {} } as unknown as Event);
    } else {
      await user.click(gearButton);
    }

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInstanceOf(HTMLElement);

    const closeButton = await screen.findByRole('button', { name: 'Close' });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('disables quick add when mapping fails to resolve a TVDB identifier', async () => {
    await setExtensionOptionsSnapshot(configuredOptions);
    __resetTestApi();

    testServer.use(
      createStaticMappingHandler('primary', { body: createStaticMappingPayload({}) }),
      createStaticMappingHandler('fallback', { body: createStaticMappingPayload({}) }),
      ...createAniListHandlers({ media: createAniMediaFixture({ id: 9999, synonyms: [] }) }),
      createSonarrLookupHandler({ results: [] }),
      createSonarrSeriesHandler({ series: [] }),
    );

    renderContentRoot({ anilistId: 9999, title: 'Unmapped Series' });

    const button = await screen.findByRole('button', { name: 'Cannot add' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('refetches status queries when a Kitsunarr broadcast is received', async () => {
    await setExtensionOptionsSnapshot(configuredOptions);
    __resetTestApi();

    testServer.use(createSonarrSeriesHandler({ series: [] }));

    renderContentRoot();

    await waitFor(() => expect(__getTestApiSpies().getSeriesStatus).toHaveBeenCalledTimes(1));

    await browserMocks.sendMessageMock({
      _kitsunarr: true,
      topic: 'series-updated',
      payload: { epoch: 2 },
    });

    await waitFor(() => expect(__getTestApiSpies().getSeriesStatus).toHaveBeenCalledTimes(2));
  });

  it('prefers the successful synonym when building the Sonarr search link', async () => {
    await setExtensionOptionsSnapshot(configuredOptions);
    __resetTestApi();

    testServer.use(
      createStaticMappingHandler('primary', { body: createStaticMappingPayload({}) }),
      createStaticMappingHandler('fallback', { body: createStaticMappingPayload({}) }),
      ...createAniListHandlers({
        media: createAniMediaFixture({ id: 24680, synonyms: ['Custom Synonym'] }),
      }),
      createSonarrLookupHandler({
        results: [
          createSonarrLookupFixture({ title: 'Custom Synonym', tvdbId: 24680 }),
          createSonarrLookupFixture({ title: 'custom synonym', tvdbId: 24680 }),
          createSonarrLookupFixture({ title: 'Custom Synonym Extra', tvdbId: 24680 }),
        ],
      }),
      createSonarrSeriesHandler({ series: [] }),
    );

    renderContentRoot({ anilistId: 24680, title: 'Search Title' });

    // Wait for the background/service status resolution to run so the
    // successful synonym is available and the external link updates.
    await waitFor(() => expect(__getTestApiSpies().getSeriesStatus).toHaveBeenCalled());

    const link = await screen.findByRole('link');
    await waitFor(() => expect(link.getAttribute('href')).toBe(
      `${configuredOptions.sonarrUrl.replace(/\/$/, '')}/add/new?term=${encodeURIComponent('Custom Synonym')}`,
    ));
  });

  it('matches only exact case-insensitive titles for Sonarr lookup results', async () => {
    await setExtensionOptionsSnapshot(configuredOptions);
    __resetTestApi();

    testServer.use(
      createStaticMappingHandler('primary', { body: createStaticMappingPayload({}) }),
      createStaticMappingHandler('fallback', { body: createStaticMappingPayload({}) }),
      ...createAniListHandlers({
        media: createAniMediaFixture({ id: 13579, synonyms: ['Exact Match'] }),
      }),
      createSonarrLookupHandler({
        results: [
          createSonarrLookupFixture({ title: 'exact match', tvdbId: 13579 }),
          createSonarrLookupFixture({ title: 'EXACT MATCH', tvdbId: 13579 }),
          createSonarrLookupFixture({ title: 'Partial Exact Match', tvdbId: 99999 }),
        ],
      }),
      createSonarrSeriesHandler({ series: [] }),
    );

    renderContentRoot({ anilistId: 13579, title: 'Some Title' });

    await waitFor(() => expect(__getTestApiSpies().getSeriesStatus).toHaveBeenCalled());

    // Should match only the exact case-insensitive title, not partials
    const link = await screen.findByRole('link');
    await waitFor(() => expect(link.getAttribute('href')).toBe(
      `${configuredOptions.sonarrUrl.replace(/\/$/, '')}/add/new?term=${encodeURIComponent('Exact Match')}`,
    ));
  });
});



