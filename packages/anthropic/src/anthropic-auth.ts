import { loadApiKey, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { VERSION } from './version';

/**
 * Creates Anthropic auth headers. Used by both the provider factory and
 * WORKFLOW_DESERIALIZE so the auth logic lives in a single place.
 */
export function createAnthropicHeaders(options?: {
  apiKey?: string;
  authToken?: string;
  headers?: Record<string, string | undefined>;
}): Record<string, string | undefined> {
  const authHeaders: Record<string, string> = options?.authToken
    ? { Authorization: `Bearer ${options.authToken}` }
    : {
        'x-api-key': loadApiKey({
          apiKey: options?.apiKey,
          environmentVariableName: 'ANTHROPIC_API_KEY',
          description: 'Anthropic',
        }),
      };

  return withUserAgentSuffix(
    {
      'anthropic-version': '2023-06-01',
      ...authHeaders,
      ...options?.headers,
    },
    `ai-sdk/anthropic/${VERSION}`,
  );
}
