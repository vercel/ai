import { loadApiKey, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { VERSION } from './version';

/**
 * Creates Google Generative AI auth headers. Used by both the provider
 * factory and WORKFLOW_DESERIALIZE so the auth logic lives in a single place.
 */
export function createGoogleHeaders(options?: {
  apiKey?: string;
  headers?: Record<string, string | undefined>;
}): Record<string, string | undefined> {
  return withUserAgentSuffix(
    {
      'x-goog-api-key': loadApiKey({
        apiKey: options?.apiKey,
        environmentVariableName: 'GOOGLE_GENERATIVE_AI_API_KEY',
        description: 'Google Generative AI',
      }),
      ...options?.headers,
    },
    `ai-sdk/google/${VERSION}`,
  );
}
