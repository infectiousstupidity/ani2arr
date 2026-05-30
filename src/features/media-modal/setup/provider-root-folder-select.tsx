/** Provider root-folder select with media modal path preview details. */
// src/features/media-modal/setup/provider-root-folder-select.tsx

import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check } from 'lucide-react';

import type { ProviderRootFolder } from '@/providers';
import { FormField } from '@/shared/ui/form/form-field';
import { Label } from '@/shared/ui/form/label';
import { Select, SelectContent, SelectTrigger } from '@/shared/ui/form/select';
import { cn } from '@/shared/utils/cn';

export interface ProviderRootFolderPathPreview {
  mode: 'add' | 'edit';
  currentPath?: string | null | undefined;
  selectedPreviewPath?: string | null | undefined;
  folderName?: string | null | undefined;
  willMove?: boolean | undefined;
  getRootFolderDisplayPath?: ((rootFolderPath: string) => string) | undefined;
}

export interface ProviderRootFolderSelectProps {
  value: string;
  rootFolders: ReadonlyArray<ProviderRootFolder>;
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  className?: string | undefined;
  triggerClassName?: string | undefined;
  pathPreview?: ProviderRootFolderPathPreview | undefined;
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

function getCreatedFolderSuffix(rootPath: string, folderName?: string | null): string | null {
  const trimmedFolderName = folderName?.trim().replace(/^[/\\]+/, '') ?? '';
  if (!trimmedFolderName) return null;

  const separator = rootPath.includes('\\') ? '\\' : '/';
  return `${separator}${trimmedFolderName}`;
}

function RootFolderPathText(props: {
  rootPath: string;
  displayPath: string;
  createdFolderName?: string | null | undefined;
  className?: string | undefined;
}): React.JSX.Element {
  const { rootPath, displayPath, createdFolderName, className } = props;
  const createdFolderSuffix = getCreatedFolderSuffix(rootPath, createdFolderName);

  if (!createdFolderSuffix) {
    return (
      <span className={className} title={displayPath || undefined}>
        {displayPath}
      </span>
    );
  }

  const rootPathDisplayPart = displayPath.endsWith(createdFolderSuffix)
    ? displayPath.slice(0, -createdFolderSuffix.length)
    : rootPath;

  return (
    <span className={className} title={displayPath || undefined}>
      <span className="text-text-primary">{rootPathDisplayPart}</span>
      <span className="text-text-secondary">{createdFolderSuffix}</span>
    </span>
  );
}

function RootFolderOption(props: {
  folder: ProviderRootFolder;
  displayPath: string;
  createdFolderName?: string | null | undefined;
}): React.JSX.Element {
  const { folder, displayPath, createdFolderName } = props;
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
          <RootFolderPathText
            rootPath={folder.path}
            displayPath={displayPath}
            createdFolderName={createdFolderName}
            className="min-w-0 truncate text-left"
          />
          {freeSpaceLabel ? (
            <span className="shrink-0 whitespace-nowrap text-xs text-text-secondary">
              {freeSpaceLabel}
            </span>
          ) : null}
        </div>
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function RootFolderHelperText(props: {
  pathPreview?: ProviderRootFolderPathPreview | undefined;
  className?: string | undefined;
}): React.JSX.Element | null {
  const { pathPreview, className } = props;
  const previewPath = pathPreview?.selectedPreviewPath ?? null;
  const folderName = pathPreview?.folderName ?? null;
  const willMove = pathPreview?.willMove ?? false;
  const isEditMode = pathPreview?.mode === 'edit';

  if (!isEditMode && folderName && previewPath) {
    return (
      <div className={cn('space-y-1', className)}>
        <p className="text-xs text-text-secondary">
          &apos;{folderName}&apos; subfolder will be created automatically.
        </p>
      </div>
    );
  }

  if (isEditMode && willMove) {
    return (
      <div className={cn('space-y-1', className)}>
        <p className="text-xs text-text-secondary" title={previewPath ?? undefined}>
          This item will move to the displayed path when you save.
        </p>
      </div>
    );
  }

  return null;
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
    className,
    triggerClassName,
    pathPreview,
  } = props;

  const isEditMode = pathPreview?.mode === 'edit';
  const createdFolderName = pathPreview?.mode === 'add' ? pathPreview.folderName : null;
  const triggerDisplayPath = (pathPreview?.selectedPreviewPath ?? value) || null;
  const getFolderDisplayPath =
    pathPreview?.getRootFolderDisplayPath ??
    ((rootFolderPath: string): string => rootFolderPath);

  return (
    <>
      <FormField>
        <div className={cn('space-y-1', className)}>
          <Label>{isEditMode ? 'Path' : 'Root Folder'}</Label>
          <Select disabled={disabled} value={value} onValueChange={onChange}>
            <SelectTrigger className={triggerClassName}>
              <span className="flex min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap">
                <SelectPrimitive.Value placeholder="Select a folder...">
                  {triggerDisplayPath ? (
                    <RootFolderPathText
                      rootPath={value}
                      displayPath={triggerDisplayPath}
                      createdFolderName={createdFolderName}
                      className="block min-w-0 truncate text-left"
                    />
                  ) : null}
                </SelectPrimitive.Value>
              </span>
            </SelectTrigger>

            <SelectContent className="max-w-[90vw]" container={portalContainer ?? null}>
              {rootFolders.map(folder => (
                <RootFolderOption
                  key={folder.id}
                  folder={folder}
                  displayPath={getFolderDisplayPath(folder.path)}
                  createdFolderName={createdFolderName}
                />
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormField>

      <RootFolderHelperText pathPreview={pathPreview} className={className} />
    </>
  );
}
