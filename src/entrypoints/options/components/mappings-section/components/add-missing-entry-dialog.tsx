import React, { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useDebounced } from '@/shared/hooks/common/use-debounced';
import { InputField } from '@/shared/ui/form/form';
import Button from '@/shared/ui/primitives/button';
import Pill from '@/shared/ui/primitives/pill';
import { getAni2arrApi } from '@/rpc';
import { useAniListMedia } from '@/shared/queries';
import type { AniFormat, AniListSearchResult } from '@/shared/types';

type AddMissingEntryDialogProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (anilistId: number, format: AniFormat | null | undefined) => void;
};

const parseAniListIdInput = (input: string): number | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/anilist\.co\/anime\/(\d+)/i);
  if (urlMatch) {
    const parsed = Number(urlMatch[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const AddMissingEntryDialog: React.FC<AddMissingEntryDialogProps> = ({ open, onClose, onSelect }) => {
  const [input, setInput] = useState('');
  const debouncedInput = useDebounced(input, 300);
  const parsedId = useMemo(() => parseAniListIdInput(debouncedInput), [debouncedInput]);
  const directMedia = useAniListMedia(parsedId ?? undefined, { enabled: open && parsedId !== null });

  const searchTerm = parsedId === null ? debouncedInput.trim() : '';
  const handleClose = () => {
    setInput('');
    onClose();
  };

  const searchQuery = useQuery<AniListSearchResult[]>({
    queryKey: ['a2a', 'anilistSearch', searchTerm],
    enabled: open && parsedId === null && searchTerm.length >= 3,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AniListSearchResult[]> => {
      try {
        const api = getAni2arrApi();
        const results = await api.searchAniList({ search: searchTerm, limit: 8 });
        return (results ?? []).map((result) => ({
          id: result.id,
          title: result.title ?? {},
          coverImage: result.coverImage
            ? {
                large: result.coverImage.large ?? null,
                medium: result.coverImage.medium ?? null,
              }
            : null,
          format: result.format ?? null,
          status: result.status ?? null,
        }));
      } catch {
        return [];
      }
    },
  });

  const results = useMemo(() => {
    if (parsedId !== null) {
      if (directMedia.data) {
        return [
          {
            id: directMedia.data.id,
            title: directMedia.data.title ?? {},
            coverImage: directMedia.data.coverImage ?? null,
            format: directMedia.data.format ?? null,
            status: directMedia.data.status ?? null,
          } satisfies AniListSearchResult,
        ];
      }
      return [];
    }
    return searchQuery.data ?? [];
  }, [directMedia.data, parsedId, searchQuery.data]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[calc(100vh-2rem)] w-[min(640px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-bg-primary p-6 shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold text-text-primary">Add missing entry</Dialog.Title>
              <Dialog.Description className="text-sm text-text-secondary">
                Paste an AniList URL, ID, or title.
              </Dialog.Description>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4">
            <InputField
              label="AniList URL, ID, or title"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://anilist.co/anime/..."
              className="mt-1"
            />
          </div>

          <div className="mt-6 space-y-3">
            {searchQuery.isFetching || directMedia.isFetching ? (
              <div className="rounded-lg border border-border-primary bg-bg-secondary/60 p-4 text-sm text-text-secondary">
                Searching AniList...
              </div>
            ) : null}

            {results.length === 0 && !(searchQuery.isFetching || directMedia.isFetching) ? (
              <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-secondary/50 p-4 text-sm text-text-secondary">
                {searchTerm.length >= 3 || parsedId !== null
                  ? 'No results found.'
                  : 'Enter at least 3 characters to search.'}
              </div>
            ) : null}

            {results.map((result) => {
              const title =
                result.title.english ||
                result.title.romaji ||
                result.title.native ||
                `AniList #${result.id}`;
              return (
                <div
                  key={result.id}
                  className="flex items-center gap-3 rounded-lg border border-border-primary bg-bg-secondary/60 p-3"
                >
                  {result.coverImage?.large ? (
                    <img
                      src={result.coverImage.large}
                      alt={title}
                      className="h-16 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="h-16 w-12 rounded bg-bg-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-text-primary">{title}</div>
                    <div className="text-xs text-text-secondary">AniList #{result.id}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase text-text-secondary">
                      {result.format ? <Pill small tone="muted">{result.format}</Pill> : null}
                      {result.status ? <Pill small tone="muted">{result.status}</Pill> : null}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setInput('');
                      onSelect(result.id, result.format);
                    }}
                  >
                    Select
                  </Button>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default AddMissingEntryDialog;
