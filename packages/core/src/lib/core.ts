import { z } from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** MVP source kinds (Xtream UI deferred; schema exists for parity). */
export const sourceTypeSchema = z.enum(['m3u_url', 'm3u_file', 'xtream']);

export type SourceType = z.infer<typeof sourceTypeSchema>;

/** JSON Schema artifact for Android / tooling (expand in Phase 1). */
export const sourceTypeJsonSchema = zodToJsonSchema(sourceTypeSchema);

export function core(): string {
  return 'core';
}
