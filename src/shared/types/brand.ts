/** Shared compile-time brand helper for domain identifiers. */
// src/shared/types/brand.ts

export type Brand<T, Name extends string> = T & { readonly __brand: Name };
