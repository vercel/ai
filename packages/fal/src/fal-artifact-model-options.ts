import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const falArtifactModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.looseObject({
      /** How frequently the Fal result endpoint is polled. */
      pollIntervalMs: z.number().positive().nullish(),

      /** Maximum time to wait for the accepted Fal job to complete. */
      pollTimeoutMs: z.number().positive().nullish(),
    }),
  ),
);

/**
 * Fal artifact generation options.
 *
 * Apart from the local polling controls, options are forwarded to the
 * selected Fal endpoint. Top-level camelCase keys are converted to Fal's
 * snake_case field names; keys that are already snake_case remain unchanged.
 */
export type FalArtifactModelOptions = InferSchema<
  typeof falArtifactModelOptionsSchema
> &
  Record<string, unknown>;
