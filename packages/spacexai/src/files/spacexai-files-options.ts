import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const spacexaiFilesOptionsSchema = lazySchema(() =>
  zodSchema(
    z.looseObject({
      teamId: z.string().optional(),
      filePath: z.string().optional(),
    }),
  ),
);

export type SpaceXAIFilesOptions = InferSchema<
  typeof spacexaiFilesOptionsSchema
>;
