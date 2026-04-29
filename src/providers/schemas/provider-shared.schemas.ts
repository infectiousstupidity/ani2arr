/** Shared focused schemas for Sonarr/Radarr provider resources consumed by the app. */
// src/providers/schemas/provider-shared.schemas.ts

import * as v from "valibot";
import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
} from "@/providers/provider-id";

export const ProviderIntegerSchema = v.pipe(
	v.number(),
	v.finite(),
	v.integer(),
);

export const ProviderNonNegativeIntegerSchema = v.pipe(
	ProviderIntegerSchema,
	v.minValue(0),
);

export const ProviderNullableStringSchema = v.nullable(v.string());

export const ProviderOptionalNullableStringSchema = v.optional(
	ProviderNullableStringSchema,
);

export const ProviderOptionalNullableNumberSchema = v.optional(
	v.nullable(v.pipe(v.number(), v.finite())),
);

export const ProviderOptionalNullableIntegerSchema = v.optional(
	v.nullable(ProviderIntegerSchema),
);

export const ProviderOptionalNullableStringArraySchema = v.optional(
	v.nullable(v.array(v.string())),
);

export const ProviderRootFolderApiSchema = v.object({
	id: v.pipe(ProviderIntegerSchema, v.minValue(1)),
	path: ProviderNullableStringSchema,
	freeSpace: v.optional(v.nullable(ProviderNonNegativeIntegerSchema)),
});

export const ProviderQualityProfileApiSchema = v.object({
	id: ProviderQualityProfileIdSchema,
	name: ProviderNullableStringSchema,
});

export const ProviderTagApiSchema = v.object({
	id: ProviderTagIdSchema,
	label: ProviderNullableStringSchema,
});

export const ProviderSystemStatusApiSchema = v.object({
	version: ProviderNullableStringSchema,
});

export const ProviderRootFolderApiArraySchema = v.array(
	ProviderRootFolderApiSchema,
);
export const ProviderQualityProfileApiArraySchema = v.array(
	ProviderQualityProfileApiSchema,
);
export const ProviderTagApiArraySchema = v.array(ProviderTagApiSchema);

export type ProviderRootFolderApi = v.InferOutput<
	typeof ProviderRootFolderApiSchema
>;
export type ProviderQualityProfileApi = v.InferOutput<
	typeof ProviderQualityProfileApiSchema
>;
export type ProviderTagApi = v.InferOutput<typeof ProviderTagApiSchema>;
export type ProviderSystemStatusApi = v.InferOutput<
	typeof ProviderSystemStatusApiSchema
>;
