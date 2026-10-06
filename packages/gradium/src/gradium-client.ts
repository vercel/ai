import { APICallError } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import {
  GradiumClient,
  GradiumAPIError,
  GradiumWebSocketError,
} from '@gradium/sdk';
import type { GradiumConfig } from './gradium-config';

export async function callGradium<T>(
  config: GradiumConfig,
  route: string,
  setup: unknown,
  signal: AbortSignal | undefined,
  call: (client: GradiumClient) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const client = new GradiumClient({
    baseUrl: config.baseURL,
    apiKey:
      config.apiKey?.() ??
      loadApiKey({
        apiKey: undefined,
        environmentVariableName: 'GRADIUM_API_KEY',
        description: 'Gradium',
      }),
    token: config.token?.(),
    fetch: config.fetch,
    webSocketFactory: config.webSocketFactory,
    ttsRoute: config.ttsRoute,
    sttRoute: config.sttRoute,
  });
  try {
    return await call(client);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (
      error instanceof GradiumAPIError ||
      error instanceof GradiumWebSocketError
    ) {
      throw new APICallError({
        message: error.message,
        url: client.wsUrl(route),
        requestBodyValues: setup,
        statusCode: error instanceof GradiumAPIError ? error.status : undefined,
        isRetryable:
          error instanceof GradiumAPIError
            ? error.status === 429 || error.status >= 500
            : error.code === undefined ||
              error.code === 1006 ||
              error.code === 1011,
        cause: error,
      });
    }
    throw error;
  }
}
