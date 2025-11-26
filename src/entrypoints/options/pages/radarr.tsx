import React from 'react';
import SectionHeader from '@/entrypoints/options/components/section-header';
import Button from '@/shared/components/button';

const RadarrPage: React.FC = () => (
  <div className="space-y-6">
    <SectionHeader
      title="Radarr"
      description="Movie support is coming soon. Configuration will mirror Sonarr with separate defaults and permissions."
    />

    <section className="rounded-2xl border border-border-primary bg-bg-secondary/70 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border-primary pb-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Radarr setup</h3>
          <p className="mt-1 text-xs text-text-secondary">Used for movies and specials.</p>
        </div>
        <span className="rounded-full border border-border-primary bg-slate-700/50 px-3 py-1 text-[11px] font-semibold text-text-secondary">
          Preview
        </span>
      </div>
      <div className="space-y-3 p-4 text-sm text-text-secondary">
        <p>Radarr support is coming soon. Configuration will mirror Sonarr with separate defaults and permissions.</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button disabled variant="secondary" size="sm">
            Configure Radarr
          </Button>
          <span className="text-text-secondary">UI placeholder only; no permissions or storage yet.</span>
        </div>
      </div>
    </section>
  </div>
);

export default RadarrPage;
