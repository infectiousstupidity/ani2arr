// src/ui/MappingFixModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import Button from '@/ui/Button';
import { usePublicOptions, useSetMappingOverride, useClearMappingOverride } from '@/hooks/use-api-queries';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalTitle } from '@/ui/Modal';
import { getAni2arrApi } from '@/rpc';
import type { SonarrLookupSeries } from '@/types';

interface MappingFixModalProps {
  anilistId: number;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  overrideActive?: boolean;
  portalContainer?: HTMLElement | null;
}

const MappingFixModal: React.FC<MappingFixModalProps> = ({
  anilistId,
  title,
  isOpen,
  onClose,
  overrideActive,
  portalContainer,
}) => {
  const { data: options } = usePublicOptions();
  const [tvdbIdInput, setTvdbIdInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ReadonlyArray<SonarrLookupSeries>>([]);
  const [libraryIds, setLibraryIds] = useState<ReadonlySet<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [validation, setValidation] = useState<{ inLibrary: boolean; inCatalog: boolean } | null>(null);
  const setOverride = useSetMappingOverride();
  const clearOverride = useClearMappingOverride();
  const sonarrUrl = options?.sonarrUrl?.replace(/\/$/, '') ?? '';

  const parsedId = useMemo(() => {
    const n = Number(tvdbIdInput.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [tvdbIdInput]);

  // Debounced Sonarr search
  useEffect(() => {
    if (!isOpen) return;
    const term = searchTerm.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const id = window.setTimeout(async () => {
      try {
        const api = getAni2arrApi();
        const out = await api.searchSonarr({ term, priority: 'high' });
        if (cancelled) return;
        setResults(out.results ?? []);
        setLibraryIds(new Set(out.libraryTvdbIds ?? []));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [searchTerm, isOpen]);

  // Debounced validation for numeric ID
  useEffect(() => {
    if (!isOpen) return;
    const id = parsedId;
    if (!id) {
      setValidation(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const api = getAni2arrApi();
        const v = await api.validateTvdbId({ tvdbId: id });
        if (!cancelled) setValidation(v);
      } catch {
        if (!cancelled) setValidation(null);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [parsedId, isOpen]);

  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <ModalContent className="w-[560px] max-w-[95vw]" container={portalContainer ?? undefined}>
        <ModalTitle>Fix mapping for {title}</ModalTitle>
        <Dialog.Close
          className="absolute right-4 top-4 rounded-sm opacity-70 text-text-primary transition-opacity hover:opacity-100 disabled:pointer-events-none"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Dialog.Close>
        <ModalDescription>
          Enter a TVDB ID to override automatic matching. Overrides sync across devices and take effect immediately.
        </ModalDescription>

        <div className="mt-2 space-y-5">
          {/* Search Sonarr */}
          <div>
            <label htmlFor="search-input" className="block text-sm font-medium mb-1 text-text-secondary">Search Sonarr</label>
            <input
              id="search-input"
              type="text"
              className="w-full h-9 px-3 rounded-md border border-border-primary bg-bg-secondary text-text-primary"
              placeholder="Type a title or tvdb:12345"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searching && <div className="mt-1 text-xs text-text-secondary">Searching…</div>}
            {results.length > 0 && (
              <ul
                className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border-primary scrollbar-gutter-stable"
                onWheelCapture={e => {
                  e.stopPropagation();
                }}
                onTouchMoveCapture={e => {
                  e.stopPropagation();
                }}
              >
                {results.map(r => (
                  <li key={`${r.tvdbId}-${r.titleSlug}`}> 
                    <button
                      type="button"
                      className={`w-full h-9 flex items-center justify-between px-3 text-left cursor-pointer hover:bg-[rgba(255,255,255,0.06)] ${selectedId === r.tvdbId ? 'bg-[rgba(255,255,255,0.08)]' : ''}`}
                      onMouseDown={e => {
                        // Avoid focus steal causing click suppression inside some portals
                        e.preventDefault();
                      }}
                      onClick={() => setSelectedId(r.tvdbId)}
                    >
                      <span className="text-sm text-[rgba(255,255,255,0.92)]">{r.title} {r.year ? `(${r.year})` : ''}</span>
                      {libraryIds.has(r.tvdbId) && (
                        <span className="text-xs text-text-secondary ml-2">In library</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="tvdb-id-input" className="block text-sm font-medium mb-1 text-text-secondary">TVDB ID</label>
            <input
              id="tvdb-id-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="w-full h-9 px-3 rounded-md border border-border-primary bg-bg-secondary text-text-primary"
              placeholder="e.g. 305074"
              value={tvdbIdInput}
              onChange={e => setTvdbIdInput(e.target.value)}
            />
            {validation && (
              <div className="mt-1 text-xs text-text-secondary">
                {validation.inLibrary ? 'In Sonarr library' : validation.inCatalog ? 'Available to add' : 'Not found in Sonarr'}
              </div>
            )}
            {sonarrUrl && parsedId && (
              <div className="mt-1 text-xs">
                <a
                  href={`${sonarrUrl}/add/new?term=${encodeURIComponent(`tvdb:${parsedId}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  Open in Sonarr lookup (tvdb:{parsedId})
                </a>
              </div>
            )}
          </div>
        </div>

        <ModalFooter className="mt-4">
          {overrideActive && (
            <Button
              variant="outline"
              onClick={() => {
                clearOverride.mutate({ anilistId }, { onSuccess: onClose });
              }}
              disabled={clearOverride.isPending}
            >
              Reset to automatic
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const id = selectedId ?? parsedId;
              if (!id) return;
              setOverride.mutate({ anilistId, tvdbId: id }, { onSuccess: onClose });
            }}
            disabled={!(selectedId || parsedId) || setOverride.isPending}
            isLoading={setOverride.isPending}
            loadingText="Saving…"
          >
            Set mapping
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default MappingFixModal;
