import {
  lazySchema,
  zodSchema,
  type FlexibleSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

export type ScaleDownExtractionModelId =
  | 'extract'
  | 'extract-1'
  | (string & {});

export type ScaleDownExtractionModelOptions = {
  /** Minimum confidence for returned matches, from 0 to 1. Defaults to 0. */
  threshold?: number;
};

export const scaledownExtractionModelOptionsSchema: FlexibleSchema<ScaleDownExtractionModelOptions> =
  lazySchema(() =>
    zodSchema(
      z.object({
        threshold: z.number().min(0).max(1).optional(),
      }),
    ),
  );
