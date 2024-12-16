import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const openaiCompatibleErrorDataSchema = z.object({
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

export type OpenAICompatibleErrorData = z.infer<
  typeof openaiCompatibleErrorDataSchema
>;

export const openaiCompatibleFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: openaiCompatibleErrorDataSchema,
    errorToMessage: data => data.error.message,
  });

export type ErrorHandlerConfig = {
  errorSchema: z.ZodType;
  errorToMessage: (data: any) => string;
};
