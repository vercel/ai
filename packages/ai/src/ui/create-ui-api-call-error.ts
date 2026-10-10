import { APICallError } from '@ai-sdk/provider';
import { extractResponseHeaders } from '@ai-sdk/provider-utils';

export async function createUIApiCallError({
  response,
  url,
  fallbackMessage,
}: {
  response: Response;
  url: string;
  fallbackMessage: string;
}) {
  const responseBody = await response.text();

  return new APICallError({
    message: responseBody || fallbackMessage,
    url,
    // UI requests can contain prompts, messages, and other sensitive values.
    // Keep them out of client-facing error objects.
    requestBodyValues: undefined,
    statusCode: response.status,
    responseHeaders: extractResponseHeaders(response),
    responseBody,
  });
}
