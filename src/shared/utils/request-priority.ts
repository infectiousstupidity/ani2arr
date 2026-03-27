/** Maps semantic request priorities to the numeric queue priorities used by scheduled work. */
// src/shared/utils/request-priority.ts

import type { RequestPriority } from '@/shared/types';

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
