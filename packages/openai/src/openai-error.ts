import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

export const openaiErrorDataSchema = () =>
  z.object({
    error: z.object({
      message: z.string(),

      // The additional information below is handled loosely to support
      // OpenAI-compatible providers that have slightly different error
      // responses:
      type: z.string().nullish(),
      param: z.any().nullish(),
      code: z.union([z.string(), z.number()]).nullish(),
    }),
  });
export const openaiErrorDataSchemaValidator = lazySchema(() =>
  zodSchema(openaiErrorDataSchema()),
);

export type OpenAIErrorData = z.infer<ReturnType<typeof openaiErrorDataSchema>>;

export const openaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: openaiErrorDataSchemaValidator,
  errorToMessage: data => data.error.message,
});
