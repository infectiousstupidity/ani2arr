/** Reusable provider root-folder select with free-space labels and optional slug preview. */
// src/components/provider-add-options/provider-root-folder-select.tsx

import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check } from 'lucide-react';

import type { ProviderRootFolder } from '@/providers';
import { FormField, Label, Select, SelectContent, SelectTrigger } from '@/shared/ui/form/form';
import { cn } from '@/shared/utils/cn';
import { joinRootAndSlug } from '@/providers/library/paths';

export interface ProviderRootFolderSelectProps {
  value: string;
  rootFolders: ReadonlyArray<ProviderRootFolder>;
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  className?: string | undefined;
  triggerClassName?: string | undefined;
  computedSlug?: string | null | undefined;
  displayRootWithSlug?: boolean | undefined;
  computedPath?: string | null | undefined;
}

function formatFreeSpace(bytes?: number | null): string | null {
  if (bytes == null || Number.isNaN(bytes)) return null;

  const tebibyte = 1024 ** 4;
  const gibibyte = 1024 ** 3;

  if (bytes >= tebibyte) {
    return `${(bytes / tebibyte).toFixed(1)} TiB free`;
  }

  if (bytes >= gibibyte) {
    return `${(bytes / gibibyte).toFixed(1)} GiB free`;
  }

  return `${bytes.toLocaleString()} B free`;
}

function getRootDisplayPath(
  rootPath: string,
  computedSlug?: string | null,
  displayRootWithSlug?: boolean,
): string {
  if (!rootPath || !displayRootWithSlug || !computedSlug) {
    return rootPath;
  }

  return joinRootAndSlug(rootPath, computedSlug);
}

export function ProviderRootFolderSelect(
  props: ProviderRootFolderSelectProps,
): React.JSX.Element {
  const {
    value,
    rootFolders,
    onChange,
    disabled = false,
    portalContainer,
    initialFocusRef,
    className,
    triggerClassName,
    computedSlug,
    displayRootWithSlug = false,
    computedPath,
  } = props;

  const selectedRootDisplay = value
    ? getRootDisplayPath(value, computedSlug, displayRootWithSlug)
    : null;

  return (
    <>
      <FormField>
        <div className={cn('space-y-1', className)}>
          <Label>Root Folder</Label>
          <Select disabled={disabled} value={value} onValueChange={onChange}>
            <SelectTrigger ref={initialFocusRef ?? undefined} className={triggerClassName}>
              <span className="flex min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap">
                <SelectPrimitive.Value placeholder="Select a folder...">
                  {selectedRootDisplay ? (
                    <span className="block min-w-0 truncate text-left" title={selectedRootDisplay}>
                      {selectedRootDisplay}
                    </span>
                  ) : null}
                </SelectPrimitive.Value>
              </span>
            </SelectTrigger>

            <SelectContent className="max-w-[90vw]" container={portalContainer ?? null}>
              {rootFolders.map(folder => {
                const fullPath = getRootDisplayPath(
                  folder.path,
                  computedSlug,
                  displayRootWithSlug,
                );
                const freeSpaceLabel = formatFreeSpace(folder.freeSpace);

                return (
                  <SelectPrimitive.Item
                    key={folder.id}
                    value={folder.path}
                    className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-bg-tertiary focus:text-text-primary data-[state=checked]:text-accent-primary"
                  >
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <SelectPrimitive.ItemIndicator>
                        <Check className="h-4 w-4" />
                      </SelectPrimitive.ItemIndicator>
                    </span>
                    <SelectPrimitive.ItemText asChild>
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="min-w-0 truncate text-left" title={fullPath || undefined}>
                          {fullPath}
                        </span>
                        {freeSpaceLabel ? (
                          <span className="shrink-0 whitespace-nowrap text-xs text-text-tertiary">
                            {freeSpaceLabel}
                          </span>
                        ) : null}
                      </div>
                    </SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </FormField>

      {computedSlug ? (
        <div className={cn('space-y-1', className)}>
          <p className="text-xs text-text-secondary" title={computedPath ?? undefined}>
            &apos;{computedSlug}&apos; subfolder will be created automatically.
          </p>
        </div>
      ) : null}
    </>
  );
}
