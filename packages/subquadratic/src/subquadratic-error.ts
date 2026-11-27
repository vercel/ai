import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// The Decisions API wraps errors in `detail`; the Chat Completions API uses the
// OpenAI error envelope, which the OpenAI-compatible default already handles.
const subquadraticDecisionErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      detail: z.object({
        message: z.string(),
        error_type: z.string().nullish(),
      }),
    }),
  ),
);

export const subquadraticDecisionFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: subquadraticDecisionErrorSchema,
    errorToMessage: ({ detail }) =>
      `${detail.message}${detail.error_type != null ? ` (${detail.error_type})` : ''}`,
  });
