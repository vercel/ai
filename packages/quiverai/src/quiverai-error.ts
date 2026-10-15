import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import type { OpenResponsesProviderSettings } from '@ai-sdk/open-responses';
import { z } from 'zod/v4';

const quiveraiErrorSchema = z.object({
  status: z.number().int(),
  code: z.string().min(1),
  message: z.string().min(1),
  request_id: z.string().min(1),
});

export const quiveraiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: quiveraiErrorSchema,
  errorToMessage: error => error.message,
  isRetryable: response => response.status === 429 || response.status >= 500,
});

export const getQuiverAIResponseErrorMetadata: NonNullable<
  OpenResponsesProviderSettings['getResponseErrorMetadata']
> = error => ({
  statusCode:
    typeof error.status_code === 'number' &&
    Number.isInteger(error.status_code) &&
    error.status_code >= 400 &&
    error.status_code <= 599
      ? error.status_code
      : undefined,
});
