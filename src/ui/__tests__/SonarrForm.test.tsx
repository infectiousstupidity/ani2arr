import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const multiTagInputMock = vi.fn((props: {
  value: string[];
  onChange: (labels: string[]) => void;
  disabled?: boolean;
}) => (
  <div>
    <span data-testid="tag-values">{props.value.join(',')}</span>
    <button type="button" onClick={() => props.onChange([...props.value, 'Archive'])} disabled={props.disabled}>
      mock-tag
    </button>
  </div>
));

vi.mock('../MultiTagInput', () => ({
  __esModule: true,
  default: (props: Parameters<typeof multiTagInputMock>[0]) => multiTagInputMock(props),
}));

import SonarrForm from '../SonarrForm';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

describe('SonarrForm', () => {
  const baseOptions = {
    qualityProfileId: 1,
    rootFolderPath: '/media',
    seriesType: 'anime' as const,
    monitorOption: 'all' as const,
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [10],
  };

  const baseData = {
    qualityProfiles: [
      { id: 1, name: '1080p' },
      { id: 2, name: '4K' },
    ],
    rootFolders: [
      { id: 1, path: '/media' },
      { id: 2, path: '/alt' },
    ],
    tags: [
      { id: 10, label: 'Anime' },
      { id: 11, label: 'Archive' },
    ],
  };

  it('renders selects and propagates changes through onChange handler', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SonarrForm
        options={baseOptions}
        data={baseData}
        onChange={handleChange}
        portalContainer={document.body}
      />,
    );

    await user.click(screen.getByLabelText('Quality Profile'));
    await user.click(screen.getByRole('option', { name: '4K' }));
    expect(handleChange).toHaveBeenCalledWith('qualityProfileId', 2);

    await user.click(screen.getByLabelText('Root Folder'));
    await user.click(screen.getByRole('option', { name: '/alt' }));
    expect(handleChange).toHaveBeenCalledWith('rootFolderPath', '/alt');

    await user.click(screen.getByLabelText('Monitor'));
    await user.click(screen.getByRole('option', { name: 'Future Episodes' }));
    expect(handleChange).toHaveBeenCalledWith('monitorOption', 'future');

    await user.click(screen.getByLabelText('Series Type'));
    await user.click(screen.getByRole('option', { name: 'Standard' }));
    expect(handleChange).toHaveBeenCalledWith('seriesType', 'standard');
  });

  it('maps tags between ids and labels and handles switches', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SonarrForm
        options={{ ...baseOptions, tags: [10], seasonFolder: false, searchForMissingEpisodes: false }}
        data={baseData}
        onChange={handleChange}
      />,
    );

    expect(screen.getByTestId('tag-values').textContent).toBe('Anime');
    await user.click(screen.getByText('mock-tag'));
    expect(handleChange).toHaveBeenCalledWith('tags', [10, 11]);

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);
    expect(handleChange).toHaveBeenCalledWith('seasonFolder', true);

    await user.click(switches[1]);
    expect(handleChange).toHaveBeenCalledWith('searchForMissingEpisodes', true);
  });
});
