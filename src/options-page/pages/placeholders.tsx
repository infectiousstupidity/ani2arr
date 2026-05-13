/** Placeholder content for options pages planned after provider settings. */
// src/options-page/pages/placeholders.tsx

const PlaceholderContent = ({ title }: { title: string }) => (
  <div className="border-t border-border-primary py-10 text-sm text-text-secondary md:border-t-0 md:py-0">
      {title} settings coming in a later phase.
  </div>
);

export const MappingsPage = () => <PlaceholderContent title="Manual Mappings" />;
