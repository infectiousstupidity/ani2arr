/** Canonical Tailwind class-name composition helper for shared UI code. */
// src/shared/utils/cn.ts

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
