import { APICallError } from '@ai-sdk/provider';
import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  type FlexibleSchema,
  type InferSchema,
  lazySchema,
  type ResponseHandler,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const tencentTokenHubErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        code: z.union([z.number(), z.string()]),
        message: z.string(),
        request_id: z.string().nullish(),
      }),
      z.object({
        error: z.object({
          message: z.string(),
          type: z.string().nullish(),
          code: z.union([z.number(), z.string()]).nullish(),
        }),
      }),
    ]),
  ),
);

export type TencentTokenHubErrorData = InferSchema<
  typeof tencentTokenHubErrorDataSchema
>;

export const tencentTokenHubFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: tencentTokenHubErrorDataSchema,
    errorToMessage: data =>
      'error' in data ? data.error.message : data.message,
  });

type TokenHubEnvelope = {
  code?: number | string | null;
  message?: string | null;
};

/**
 * TokenHub's Kling endpoints follow the Kling envelope, where a non-zero
 * `code` marks a failed request even when the HTTP status is 2xx.
 */
export function createTencentTokenHubResponseHandler<
  T extends TokenHubEnvelope,
>(schema: FlexibleSchema<T>): ResponseHandler<T> {
  const handler = createJsonResponseHandler(schema);

  return async options => {
    const result = await handler(options);
    const { code, message } = result.value;

    if (code != null && code !== 0 && code !== '0') {
      throw new APICallError({
        message: message ?? `TokenHub request failed with code ${code}`,
        url: options.url,
        requestBodyValues: options.requestBodyValues,
        statusCode: options.response.status,
        responseHeaders: result.responseHeaders,
        responseBody: JSON.stringify(result.rawValue),
        isRetryable: false,
        data: result.value,
      });
    }

    return result;
  };
}
