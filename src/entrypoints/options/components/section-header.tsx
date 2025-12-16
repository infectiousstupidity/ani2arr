// src/entrypoints/options/components/section-header.tsx
import React from 'react';

const SectionHeader: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <header className="space-y-1">
    <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
    <p className="text-sm text-text-secondary">{description}</p>
  </header>
);

export default SectionHeader;
