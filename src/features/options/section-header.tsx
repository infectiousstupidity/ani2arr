/** Shared section header for options-page feature sections. */
// src/features/options/section-header.tsx

import React from 'react';

const SectionHeader: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <header className="space-y-2">
    <h2 className="text-[1.75rem] font-semibold tracking-tight text-text-primary">{title}</h2>
    <p className="max-w-3xl text-sm text-text-secondary">{description}</p>
  </header>
);

export default SectionHeader;
