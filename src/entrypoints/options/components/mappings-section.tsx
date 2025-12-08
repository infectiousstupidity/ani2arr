import React from 'react';
import MappingsExplorer from './mappings-explorer';

const MappingsSection: React.FC<{
  targetAnilistId?: number;
  onClearTargetAnilistId?: () => void;
}> = ({ targetAnilistId, onClearTargetAnilistId }) => {
  return (
    <div className="space-y-4">
      <MappingsExplorer
        key={targetAnilistId ?? 'mappings'}
        {...(targetAnilistId !== undefined ? { targetAnilistId } : {})}
        {...(onClearTargetAnilistId ? { onClearTargetAnilistId } : {})}
      />
    </div>
  );
};

export default MappingsSection;
