import { APICallError } from '@ai-sdk/provider';
import {
  createJsonErrorResponseHandler,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const openaiErrorDataSchema = z.object({
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

export type OpenAIErrorData = z.infer<typeof openaiErrorDataSchema>;

export const openaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: openaiErrorDataSchema,
  errorToMessage: data => data.error.message,
});

export const createOpenAIResponsesFailedResponseHandler = ({
  isCustomBaseURL,
}: {
  isCustomBaseURL: boolean;
}): ResponseHandler<APICallError> => {
  if (!isCustomBaseURL) {
    return openaiFailedResponseHandler;
  }

  return async options => {
    const result = await openaiFailedResponseHandler(options);
    const error = result.value;

    if (error.statusCode !== 404) {
      return result;
    }

    return {
      ...result,
      value: new APICallError({
        message:
          `${error.message} The default model factory from createOpenAI uses ` +
          'the Responses API. If this custom base URL only supports Chat ' +
          'Completions, use provider.chat(modelId) instead. For third-party ' +
          'OpenAI-compatible providers, use @ai-sdk/openai-compatible.',
        url: error.url,
        requestBodyValues: error.requestBodyValues,
        statusCode: error.statusCode,
        responseHeaders: error.responseHeaders,
        responseBody: error.responseBody,
        cause: error,
        isRetryable: error.isRetryable,
        data: error.data,
      }),
    };
  };
};
