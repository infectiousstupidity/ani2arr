import type { RequestPriority } from '@/types';

// Map semantic request priority to queue numeric priority.
// Higher numbers run sooner in PQueue; lower run later.
export function priorityValue(level?: RequestPriority): number {
  switch (level) {
    case 'high':
      return 10;
    case 'low':
      return -10;
    default:
      return 0;
  }
}

