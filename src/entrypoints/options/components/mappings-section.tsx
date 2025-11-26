import React, { useMemo, useState } from 'react';
import Button from '@/shared/components/button';
import { Input } from '@/shared/components/form';
import {
  useAniListMedia,
  useClearAllMappingOverrides,
  useClearMappingOverride,
  useMappingOverrides,
  useSetMappingOverride,
} from '@/shared/hooks/use-api-queries';
import { useConfirm } from '@/shared/hooks/use-confirm';
import { useToast } from '@/shared/components/toast-provider';
import type { MappingOverrideRecord } from '@/shared/types';

const formatDate = (value: number): string => {
  if (!value || Number.isNaN(value)) return 'Unknown';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Unknown';
  }
};

const OverrideRow: React.FC<{
  entry: MappingOverrideRecord;
  onEdit: (anilistId: number, tvdbId: number) => Promise<void>;
  onDelete: (anilistId: number) => Promise<void>;
  isMutating: boolean;
}> = ({ entry, onEdit, onDelete, isMutating }) => {
  const media = useAniListMedia(entry.anilistId, { enabled: Boolean(entry.anilistId) });
  const [isEditing, setIsEditing] = useState(false);
  const [tvdbInput, setTvdbInput] = useState(() => String(entry.tvdbId));

  const handleSave = async () => {
    const parsed = Number(tvdbInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTvdbInput(String(entry.tvdbId));
      setIsEditing(false);
      return;
    }
    await onEdit(entry.anilistId, parsed);
    setIsEditing(false);
  };

  return (
    <div className="grid grid-cols-12 items-center gap-3 border-b border-border-primary py-3 text-sm text-text-primary last:border-b-0">
      <div className="col-span-4 min-w-0">
        <div className="truncate font-semibold">
          {media.data?.title?.english || media.data?.title?.romaji || media.data?.title?.native || `AniList #${entry.anilistId}`}
        </div>
        <div className="text-xs text-text-secondary">AniList #{entry.anilistId}</div>
      </div>
      <div className="col-span-3 min-w-0">
        <div className="text-xs text-text-secondary">TVDB ID</div>
        {isEditing ? (
          <Input
            value={tvdbInput}
            onChange={(e) => setTvdbInput(e.target.value)}
            className="mt-1 h-9"
            inputMode="numeric"
          />
        ) : (
          <div className="font-medium">#{entry.tvdbId}</div>
        )}
      </div>
      <div className="col-span-3 min-w-0 text-xs text-text-secondary">
        Updated {formatDate(entry.updatedAt)}
      </div>
      <div className="col-span-2 flex justify-end gap-2">
        {isEditing ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSave}
              disabled={isMutating}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTvdbInput(String(entry.tvdbId));
                setIsEditing(false);
              }}
              disabled={isMutating}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsEditing(true)}
              disabled={isMutating}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-error border-error"
              onClick={() => onDelete(entry.anilistId)}
              disabled={isMutating}
            >
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const CreateOverrideForm: React.FC<{
  onSubmit: (payload: { anilistId: number; tvdbId: number }) => Promise<void>;
  isSubmitting: boolean;
}> = ({ onSubmit, isSubmitting }) => {
  const [anilistId, setAnilistId] = useState('');
  const [tvdbId, setTvdbId] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAni = Number(anilistId);
    const parsedTvdb = Number(tvdbId);
    if (!Number.isFinite(parsedAni) || parsedAni <= 0 || !Number.isFinite(parsedTvdb) || parsedTvdb <= 0) {
      return;
    }
    await onSubmit({ anilistId: parsedAni, tvdbId: parsedTvdb });
    setAnilistId('');
    setTvdbId('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-lg border border-border-primary bg-bg-secondary/60 p-4 md:grid-cols-12 md:items-end"
    >
      <div className="md:col-span-4">
        <label className="text-xs text-text-secondary">AniList ID</label>
        <Input
          value={anilistId}
          onChange={(e) => setAnilistId(e.target.value)}
          placeholder="e.g. 21708"
          inputMode="numeric"
          className="mt-1"
        />
      </div>
      <div className="md:col-span-4">
        <label className="text-xs text-text-secondary">TVDB ID</label>
        <Input
          value={tvdbId}
          onChange={(e) => setTvdbId(e.target.value)}
          placeholder="e.g. 79824"
          inputMode="numeric"
          className="mt-1"
        />
      </div>
      <div className="md:col-span-4 flex gap-2 md:justify-end">
        <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="w-full md:w-auto">
          Add override
        </Button>
      </div>
    </form>
  );
};

const EmptyState: React.FC = () => (
  <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-secondary/40 px-4 py-6 text-center text-sm text-text-secondary">
    No overrides set yet. Add an AniList → TVDB link to take priority over auto-detection.
  </div>
);

const MappingsSection: React.FC = () => {
  const overrides = useMappingOverrides();
  const setOverride = useSetMappingOverride();
  const clearOverride = useClearMappingOverride();
  const clearAllOverrides = useClearAllMappingOverrides();
  const confirm = useConfirm();
  const toast = useToast();

  const isMutating = setOverride.isPending || clearOverride.isPending || clearAllOverrides.isPending;

  const handleCreateOrUpdate = async (payload: { anilistId: number; tvdbId: number }) => {
    try {
      await setOverride.mutateAsync({ anilistId: payload.anilistId, tvdbId: payload.tvdbId });
      toast.showToast({
        title: 'Override saved',
        description: `AniList #${payload.anilistId} now maps to TVDB #${payload.tvdbId}.`,
        variant: 'success',
      });
    } catch (error) {
      toast.showToast({
        title: 'Override failed',
        description: (error as Error)?.message ?? 'Unable to save override.',
        variant: 'error',
      });
    }
  };

  const handleDelete = async (anilistId: number) => {
    const shouldDelete = await confirm({
      title: 'Remove override?',
      description: `Clear the manual mapping for AniList #${anilistId}?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (!shouldDelete) return;
    try {
      await clearOverride.mutateAsync({ anilistId });
      toast.showToast({
        title: 'Override removed',
        description: `Cleared manual mapping for AniList #${anilistId}.`,
        variant: 'success',
      });
    } catch (error) {
      toast.showToast({
        title: 'Remove failed',
        description: (error as Error)?.message ?? 'Unable to remove override.',
        variant: 'error',
      });
    }
  };

  const handleClearAll = async () => {
    const shouldClear = await confirm({
      title: 'Clear all overrides?',
      description: 'This will remove every manual AniList → TVDB mapping.',
      confirmText: 'Clear all',
      cancelText: 'Cancel',
    });
    if (!shouldClear) return;
    try {
      await clearAllOverrides.mutateAsync();
      toast.showToast({
        title: 'Overrides cleared',
        description: 'All manual mappings have been removed.',
        variant: 'success',
      });
    } catch (error) {
      toast.showToast({
        title: 'Clear failed',
        description: (error as Error)?.message ?? 'Unable to clear overrides.',
        variant: 'error',
      });
    }
  };

  const rows = useMemo(() => overrides.data ?? [], [overrides.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Mappings & overrides</h2>
          <p className="text-sm text-text-secondary">
            Manual AniList → TVDB links take priority over detected mappings.
          </p>
        </div>
        {rows.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={isMutating}
            className="text-error border-error"
          >
            Clear all
          </Button>
        ) : null}
      </div>

      <CreateOverrideForm onSubmit={handleCreateOrUpdate} isSubmitting={setOverride.isPending} />

      <div className="rounded-xl border border-border-primary bg-bg-secondary/70">
        <div className="flex items-center justify-between border-b border-border-primary px-4 py-3 text-xs text-text-secondary">
          <span>Manual mappings</span>
          {overrides.isFetching ? <span>Refreshing…</span> : <span>Total {rows.length}</span>}
        </div>
        {overrides.isLoading ? (
          <div className="p-4 text-sm text-text-secondary">Loading overrides…</div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState />
          </div>
        ) : (
          <div className="divide-y divide-border-primary/70">
            {rows.map((entry) => (
              <OverrideRow
                key={entry.anilistId}
                entry={entry}
                onEdit={async (anilistId, tvdbId) => handleCreateOrUpdate({ anilistId, tvdbId })}
                onDelete={handleDelete}
                isMutating={isMutating}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MappingsSection;
