import React, { useMemo } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import type { SonarrRootFolder } from '@/shared/types';
import { cn } from '@/shared/utils/cn';
import { FormField, Label, Select, SelectContent, SelectItem, SelectTrigger } from '@/shared/ui/form/form';
import { formatFreeSpace, formatRootPathWithSlug } from '../helpers';

type RootFolderFieldProps = {
  disabled: boolean;
  value: string;
  rootFolders: SonarrRootFolder[];
  onChange: (value: string) => void;
  portalContainer: HTMLElement | ShadowRoot | null;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  fullWidthClass?: string | undefined;
  computedSlug: string | null;
  displayRootWithSlug: boolean;
  computedPath?: string | null | undefined;
};

export const RootFolderField = (props: RootFolderFieldProps) => {
  const {
    disabled,
    value,
    rootFolders,
    onChange,
    portalContainer,
    initialFocusRef,
    fullWidthClass,
    computedSlug,
    displayRootWithSlug,
    computedPath,
  } = props;

  const showPathHint = Boolean(computedSlug);

  const getRootDisplayPath = useMemo(() => {
    return (rootPath: string) => {
      if (!rootPath) return rootPath;
      return displayRootWithSlug ? formatRootPathWithSlug(rootPath, computedSlug) : rootPath;
    };
  }, [computedSlug, displayRootWithSlug]);

  const selectedRootDisplay = useMemo(() => {
    if (!value) return null;
    return getRootDisplayPath(value) ?? value;
  }, [getRootDisplayPath, value]);

  return (
    <>
      <FormField>
        <div className={cn('space-y-1', fullWidthClass)}>
          <Label>Root Folder</Label>
          <Select disabled={disabled} value={value} onValueChange={onChange}>
            <SelectTrigger ref={initialFocusRef ?? undefined}>
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

            <SelectContent container={portalContainer}>
              {rootFolders.map(folder => {
                const fullPath = getRootDisplayPath(folder.path) ?? '';
                const freeSpaceLabel = formatFreeSpace(folder.freeSpace);
                return (
                  <SelectItem key={folder.id} value={folder.path}>
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
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </FormField>

      {(Boolean(computedPath) || showPathHint) && showPathHint ? (
        <div className={cn('space-y-1', fullWidthClass)}>
          <p className="text-xs text-text-secondary">
            &apos;{computedSlug}&apos; subfolder will be created automatically.
          </p>
        </div>
      ) : null}
    </>
  );
};
