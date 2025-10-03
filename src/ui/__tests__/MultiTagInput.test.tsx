import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getReactHandler } from '@/testing';

import MultiTagInput from '../MultiTagInput';

describe('MultiTagInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds tags from keyboard interactions and shows suggestions', () => {
    let currentValue: string[] = [];
    let rerenderFn: ((ui: React.ReactElement) => void) | null = null;
    const handleChange = vi.fn((next: string[]) => {
      currentValue = next;
      rerenderFn?.(
        <MultiTagInput
          value={currentValue}
          onChange={handleChange}
          existingTags={['Existing', 'Another', 'Third']}
          placeholder="Add tags"
        />,
      );
    });

    const { rerender } = render(
      <MultiTagInput
        value={currentValue}
        onChange={handleChange}
        existingTags={['Existing', 'Another', 'Third']}
        placeholder="Add tags"
      />,
    );
    rerenderFn = rerender;

    const input = screen.getByPlaceholderText('Add tags') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'an' } });
    const suggestion = screen.getByRole('option', { name: 'Another' });
    fireEvent.mouseDown(suggestion);
    expect(handleChange).toHaveBeenNthCalledWith(1, ['Another']);

    fireEvent.change(input, { target: { value: 'third' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(handleChange).toHaveBeenLastCalledWith(['Another', 'third']);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('removes tags via button and backspace behaviour', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <MultiTagInput value={['first', 'second']} onChange={handleChange} />,
    );

    const removeButtons = screen.getAllByRole('button', { name: /Remove/ });
    // assert element exists and use non-null assertion to satisfy TypeScript
    expect(removeButtons[0]).toBeTruthy();
    fireEvent.click(removeButtons[0]!);
    expect(handleChange).toHaveBeenCalledWith(['second']);

    rerender(<MultiTagInput value={['first']} onChange={handleChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('closes suggestions on blur and respects disabled state for removal', async () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <MultiTagInput value={['tag']} onChange={handleChange} existingTags={['tag', 'test']} />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 't' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.blur(input);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole('listbox')).toBeNull();

    rerender(<MultiTagInput value={['tag']} onChange={handleChange} disabled existingTags={['tag', 'test']} />);
    const removeButton = screen.getByRole('button', { name: 'Remove tag' });
    fireEvent.click(removeButton);
    expect(handleChange).not.toHaveBeenCalled();

    const onClick = getReactHandler(removeButton, 'onClick') as React.MouseEventHandler<HTMLButtonElement> | null;
    expect(onClick).toBeInstanceOf(Function);
    onClick?.({
      preventDefault: () => {},
      stopPropagation: () => {},
    } as React.MouseEvent<HTMLButtonElement>);
    expect(handleChange).not.toHaveBeenCalled();
  });
});
