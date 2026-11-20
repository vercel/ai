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
         * Seconds after upload before the file expires. Omit it to use the
         * Gateway's default retention.
         */
        expiresAfter: z.optional(z.number().check(z.int()).check(z.minimum(1))),
      }),
      z.unknown(),
    ),
  ),
);

export type GatewayFilesOptions = InferSchema<typeof gatewayFilesOptionsSchema>;
