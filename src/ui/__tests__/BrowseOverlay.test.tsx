import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createStatusStub, createAddSeriesStub } from '@/testing/mocks/useApiQueriesMock';
import type { BrowseAdapter } from '@/types';
import {
  hoisted,
  createCard,
  setupAdapter,
  getMutationObservers,
  getResizeObservers,
  TooltipWrapperMock,
  useThemeMock,
  addSeriesModalSpy,
  renderWithProviders,
} from './browse-overlay/test-harness';
import { createBrowseContentApp } from '@/ui/BrowseOverlay';

describe('createBrowseContentApp', () => {
  it('detects cards, marks hosts processed, and cleans up when nodes are removed', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card: validCard, overlayHost: validHost } = createCard(1, 'Valid Card');
    const { card: invalidCard } = createCard(2, 'Invalid Card', { invalid: true });
    pageContent.append(validCard, invalidCard);

    const { adapter, parseCard, ensureContainer } = setupAdapter();

  hoisted.seriesStatusMap.set(1, createStatusStub());

    const BrowseContentApp = createBrowseContentApp(adapter);
    const { container } = renderWithProviders(<BrowseContentApp />);

    await waitFor(() => {
      const containerNode = validHost.querySelector('.kitsunarr-container');
      expect(containerNode?.querySelector('.kitsunarr-card-overlay')).toBeTruthy();
    });

    expect(parseCard).toHaveBeenCalledWith(validCard);
    expect(ensureContainer).toHaveBeenCalledWith(validHost, validCard);
    expect(adapter.onCardInvalid).toHaveBeenCalledWith(invalidCard);

    expect(validHost.getAttribute('data-kitsunarr-test')).toBe('1');

    const themeRef = useThemeMock.mock.calls[0]?.[0];
    expect(themeRef).toBeDefined();
    await waitFor(() => {
      expect(themeRef?.current).toBe(container.firstChild);
    });

    expect(TooltipWrapperMock).toHaveBeenCalled();
    TooltipWrapperMock.mock.calls.forEach(([props]) => {
      expect(props.container).toBe(document.body);
    });

    expect(getMutationObservers().length).toBeGreaterThan(0);

    const { card: directCard, overlayHost: directHost } = createCard(3, 'Direct Card');
  hoisted.seriesStatusMap.set(3, createStatusStub());
    pageContent.appendChild(directCard);

    const triggerObservers = async (records: Partial<MutationRecord>[]) => {
      await act(async () => {
        getMutationObservers().forEach(observer => observer.trigger(records));
      });
    };

    await triggerObservers([
      {
        type: 'childList',
        target: pageContent,
        addedNodes: [directCard],
        removedNodes: [],
      } as unknown as MutationRecord,
    ]);

    await waitFor(() => {
      expect(ensureContainer).toHaveBeenCalledWith(directHost, directCard);
      expect(directHost.getAttribute('data-kitsunarr-test')).toBe('3');
    });

    const wrapper = document.createElement('div');
    const { card: rescanCard, overlayHost: rescanHost } = createCard(4, 'Rescan Card');
  hoisted.seriesStatusMap.set(4, createStatusStub());
    wrapper.appendChild(rescanCard);
    pageContent.appendChild(wrapper);

    const parseCallsBeforeRescan = parseCard.mock.calls.length;

    await triggerObservers([
      {
        type: 'childList',
        target: pageContent,
        addedNodes: [wrapper],
        removedNodes: [],
      } as unknown as MutationRecord,
    ]);

    await waitFor(() => {
      expect(parseCard.mock.calls.length).toBeGreaterThan(parseCallsBeforeRescan);
      expect(rescanHost.getAttribute('data-kitsunarr-test')).toBe('4');
    });

    const existingContainer = validHost.querySelector('.kitsunarr-container');
  existingContainer?.remove();

  const resizeList = getResizeObservers();
  expect(resizeList).toHaveLength(1);
  const ro = resizeList[0];
  expect(ro).toBeDefined();
  ro?.trigger();

    await waitFor(() => {
      expect(validHost.hasAttribute('data-kitsunarr-test')).toBe(false);
    });

    pageContent.removeChild(validCard);
    await triggerObservers([
      {
        type: 'childList',
        target: pageContent,
        addedNodes: [],
        removedNodes: [validCard],
      } as unknown as MutationRecord,
    ]);

    await waitFor(() => {
      expect(adapter.onCardInvalid).toHaveBeenCalledWith(validCard);
    });
  });

  it('skips scanning when scan root is unavailable and ignores invalid resize targets', () => {
    const observerRoot = document.createElement('div');
    document.body.appendChild(observerRoot);

    const brokenIterable = {
      [Symbol.iterator]() {
        throw new Error('broken iterable');
      },
    };

    const { adapter, parseCard } = setupAdapter({
      getObserverRoot: () => observerRoot,
      getScanRoot: () => null,
      resizeObserverTargets: () => brokenIterable as unknown as Iterable<Element>,
    });

    const BrowseContentApp = createBrowseContentApp(adapter);
    renderWithProviders(<BrowseContentApp />);

    expect(parseCard).not.toHaveBeenCalled();
    expect(getResizeObservers()).toHaveLength(0);
    const mutationList = getMutationObservers();
    expect(mutationList).toHaveLength(1);
    expect(mutationList[0]?.observe).toHaveBeenCalled();
  });

  it('retries mapping when status reports missing link and quick add is pressed', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(10, 'Mapping Error');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();

    const refetch = vi.fn(() => Promise.resolve());
    hoisted.seriesStatusMap.set(
      10,
      createStatusStub({
        data: { anilistTvdbLinkMissing: true },
        refetch,
      }),
    );

    const BrowseContentApp = createBrowseContentApp(adapter);
    renderWithProviders(<BrowseContentApp />);

    const quickButton = await waitFor(() =>
      overlayHost.querySelector<HTMLButtonElement>('button.kitsunarr-card-overlay__quick'),
    );

    expect(quickButton?.getAttribute('aria-label')).toBe('Retry mapping lookup');

    expect(quickButton).not.toBeNull();
    fireEvent.click(quickButton!);

    await waitFor(() => {
      expect(refetch).toHaveBeenCalledWith({ throwOnError: false });
    });
  });

  it('quick adds when defaults are available and opens the modal for advanced options', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(20, 'Addable Card');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();

  hoisted.seriesStatusMap.set(20, createStatusStub());

  const mutate = vi.fn();
  hoisted.currentAddSeriesResultRef.value = createAddSeriesStub({ mutate });

    const BrowseContentApp = createBrowseContentApp(adapter);
    renderWithProviders(<BrowseContentApp />);

    const quickButton = await waitFor(() =>
      overlayHost.querySelector<HTMLButtonElement>('button.kitsunarr-card-overlay__quick'),
    );
    expect(quickButton?.disabled).toBe(false);

    expect(quickButton).not.toBeNull();
    fireEvent.click(quickButton!);

    expect(mutate).toHaveBeenCalledWith({
      anilistId: 20,
      title: 'Addable Card',
      primaryTitleHint: 'Addable Card',
      metadata: null,
  form: hoisted.publicOptionsResult.data.defaults,
    });

    const gearButton = overlayHost.querySelector<HTMLButtonElement>('button.kitsunarr-card-overlay__gear');
    expect(gearButton).toBeTruthy();
    fireEvent.click(gearButton!);

    const modal = await screen.findByTestId('add-series-modal');
    expect(modal.getAttribute('data-anilist-id')).toBe('20');
    expect(modal.getAttribute('data-title')).toBe('Addable Card');
    expect(modal.getAttribute('data-portal-host')).toBe('present');

    expect(addSeriesModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        anilistId: 20,
        title: 'Addable Card',
        metadata: null,
      }),
    );
  });

  it('enters the in-sonarr state when add mutation succeeds', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(30, 'Existing Card');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();

  hoisted.seriesStatusMap.set(30, createStatusStub());
  hoisted.currentAddSeriesResultRef.value = createAddSeriesStub({ isSuccess: true });

    const BrowseContentApp = createBrowseContentApp(adapter);
    renderWithProviders(<BrowseContentApp />);

    const overlayRoot = await waitFor(() =>
      overlayHost.querySelector<HTMLElement>('.kitsunarr-card-overlay'),
    );

    expect(overlayRoot?.dataset.state).toBe('in-sonarr');
  });

  it('disables overlays when Sonarr configuration is missing', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(40, 'Unconfigured Card');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();

  hoisted.seriesStatusMap.set(40, createStatusStub());
    hoisted.publicOptionsResult.data = {
      sonarrUrl: '',
      isConfigured: false,
      defaults: null,
    };

    const BrowseContentApp = createBrowseContentApp(adapter);
    renderWithProviders(<BrowseContentApp />);

    const overlayRoot = await waitFor(() =>
      overlayHost.querySelector<HTMLElement>('.kitsunarr-card-overlay'),
    );

    expect(overlayRoot?.dataset.state).toBe('disabled');
  });

  it('handles attribute mutations, rescans when cards disappear, and ignores resize observer errors', async () => {
    document.body.dataset.throwResize = 'true';

    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(50, 'Watched Card');
    pageContent.appendChild(card);

    const { adapter, ensureContainer } = setupAdapter({
      getObserverRoot: () => pageContent,
      getScanRoot: () => pageContent,
    });

    hoisted.seriesStatusMap.set(50, createStatusStub());

    const BrowseContentApp = createBrowseContentApp(adapter);
    renderWithProviders(<BrowseContentApp />);

    await waitFor(() => {
      expect(ensureContainer).toHaveBeenCalledWith(overlayHost, card);
    });

    const ensureCallsBeforeAttribute = ensureContainer.mock.calls.length;

    await act(async () => {
      getMutationObservers().forEach(observer =>
        observer.trigger([
          {
            type: 'attributes',
            target: card,
            addedNodes: [] as unknown as NodeListOf<ChildNode>,
            removedNodes: [] as unknown as NodeListOf<ChildNode>,
            attributeName: null as unknown as string,
            attributeNamespace: null as unknown as string,
            previousSibling: null,
            nextSibling: null,
            oldValue: null,
          } as unknown as MutationRecord,
        ]),
      );
    });

    await waitFor(() => {
      expect(ensureContainer.mock.calls.length).toBeGreaterThan(ensureCallsBeforeAttribute);
    });

    const containerNode = overlayHost.querySelector('.kitsunarr-container');
    expect(containerNode).not.toBeNull();

    pageContent.removeChild(card);

    const fragment = document.createDocumentFragment();
    const ghostCard = createCard(99, 'Ghost Card').card;
    fragment.appendChild(ghostCard);

    await act(async () => {
      getMutationObservers().forEach(observer =>
        observer.trigger([
          {
            type: 'childList',
            target: pageContent,
            addedNodes: [] as unknown as NodeListOf<ChildNode>,
            removedNodes: [card] as unknown as NodeListOf<ChildNode>,
            attributeName: null as unknown as string,
            attributeNamespace: null as unknown as string,
            previousSibling: null,
            nextSibling: null,
            oldValue: null,
          } as unknown as MutationRecord,
        ]),
      );
    });

    await waitFor(() => {
      expect(adapter.onCardInvalid).toHaveBeenCalledWith(card);
      expect(containerNode?.isConnected).toBe(false);
    });

    delete document.body.dataset.throwResize;
  });

  it('removes fallback containers when card parsing fails', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card: invalidCard, overlayHost } = createCard(60, 'Invalid');
    invalidCard.dataset.invalid = 'true';
    const fallbackContainer = document.createElement('div');
    fallbackContainer.className = 'kitsunarr-container';
    overlayHost.appendChild(fallbackContainer);
    pageContent.appendChild(invalidCard);

    const { adapter } = setupAdapter();

    const BrowseContentApp = createBrowseContentApp(adapter);
    renderWithProviders(<BrowseContentApp />);

    await waitFor(() => {
      expect(adapter.onCardInvalid).toHaveBeenCalledWith(invalidCard);
    });

    expect(fallbackContainer.isConnected).toBe(false);
  });

  it('creates default containers when adapter does not supply one', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(70, 'Fallback Card');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();
    // Remove ensureContainer to use default implementation
    delete (adapter as Partial<BrowseAdapter>).ensureContainer;

  hoisted.seriesStatusMap.set(70, createStatusStub());

    const BrowseContentApp = createBrowseContentApp(adapter);
    renderWithProviders(<BrowseContentApp />);

    await waitFor(() => {
      expect(overlayHost.querySelector('.kitsunarr-container')).toBeTruthy();
    });
  });
});
