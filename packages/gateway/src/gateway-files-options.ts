import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from './zod';

export const gatewayFilesOptionsSchema = lazySchema(() =>
  zodSchema(
    z.catchall(
      z.object({
        /**
         * Seconds after upload before the file expires. AI Gateway rounds it up
         * to whole days, up to 730 days. Defaults to 30 days.
         */
        expiresAfter: z.optional(z.number().check(z.int()).check(z.minimum(1))),
      }),
      z.unknown(),
    ),
  ),
);

export type GatewayFilesOptions = InferSchema<typeof gatewayFilesOptionsSchema>;
