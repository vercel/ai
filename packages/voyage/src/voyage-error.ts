import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const voyageErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      detail: z.string(),
    }),
  ),
);

export type VoyageErrorData = InferSchema<typeof voyageErrorDataSchema>;

export const voyageFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: voyageErrorDataSchema,
  errorToMessage: data => data.detail,
});
