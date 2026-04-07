import { loadApiKey, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { VERSION } from './version';

/**
 * Creates Mistral auth headers. Used by both the provider factory and
 * WORKFLOW_DESERIALIZE so the auth logic lives in a single place.
 */
export function createMistralHeaders(options?: {
  apiKey?: string;
  headers?: Record<string, string | undefined>;
}): Record<string, string | undefined> {
  return withUserAgentSuffix(
    {
      Authorization: `Bearer ${loadApiKey({
        apiKey: options?.apiKey,
        environmentVariableName: 'MISTRAL_API_KEY',
        description: 'Mistral',
      })}`,
      ...options?.headers,
    },
    `ai-sdk/mistral/${VERSION}`,
  );
}
