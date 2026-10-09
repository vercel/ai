import type { APICallError } from '@ai-sdk/provider';
import { z, type ZodType } from 'zod/v4';
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

export type ProviderErrorStructure<T> = {
  errorSchema: ZodType<T>;
  errorToMessage: (error: T) => string;
  isRetryable?: (response: Response, error?: T) => boolean;
  reason?: (response: Response, error: T) => APICallError['reason'];
};

export const defaultOpenAICompatibleErrorStructure: ProviderErrorStructure<OpenAICompatibleErrorData> =
  {
    errorSchema: openaiCompatibleErrorDataSchema,
    errorToMessage: data => data.error.message,
    reason: (_response, data) =>
      data.error.code === 'context_length_exceeded'
        ? 'context-length-exceeded'
        : undefined,
  };
