import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  Input,
  Switch,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  useFormField,
} from '../Form';

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

describe('Form primitives', () => {
  it('wires ids between label and form controls', async () => {
    const user = userEvent.setup();

    render(
      <FormField>
        <FormItem>
          <FormLabel>Label</FormLabel>
          <FormControl>
            <Input placeholder="Type" />
          </FormControl>
        </FormItem>
      </FormField>,
    );

    const input = screen.getByPlaceholderText('Type');
    const label = screen.getByText('Label');
    expect(label).toHaveAttribute('for', input.getAttribute('id'));

    await user.type(input, 'hello');
    expect(input).toHaveValue('hello');
  });

  it('renders select content into provided container', async () => {
    const portalHost = document.createElement('div');
    document.body.appendChild(portalHost);
    const user = userEvent.setup();

    render(
      <FormField>
        <FormItem>
          <FormLabel>Choose</FormLabel>
          <FormControl>
            <Select defaultValue="a">
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent container={portalHost}>
                <SelectItem value="a">Option A</SelectItem>
                <SelectItem value="b">Option B</SelectItem>
              </SelectContent>
            </Select>
          </FormControl>
        </FormItem>
      </FormField>,
    );

    await user.click(screen.getByRole('combobox'));
    expect(portalHost.textContent).toContain('Option A');
  });

  it('attaches switch controls to generated ids and toggles state', async () => {
    const user = userEvent.setup();

    render(
      <FormField>
        <FormItem>
          <FormLabel>Toggle</FormLabel>
          <FormControl>
            <Switch />
          </FormControl>
        </FormItem>
      </FormField>,
    );

    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('id')).toBeTruthy();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('data-state', 'checked');
  });

  it('throws when useFormField is used outside provider', () => {
    const TestComponent = () => {
      useFormField();
      return null;
    };

    expect(() => render(<TestComponent />)).toThrow('useFormField should be used within <FormField>');
  });
});
