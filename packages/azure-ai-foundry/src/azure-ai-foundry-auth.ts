import { loadApiKey, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { VERSION } from './version';

export interface AzureAIFoundryAuthSettings {
  apiKey?: string;
  tokenProvider?: () => Promise<string>;
  anthropicVersion?: string;
  headers?: Record<string, string | undefined>;
}

/**
 * Create a synchronous header provider for the OpenAI API path.
 *
 * When a tokenProvider is configured, the token is cached and refreshed
 * in the background. The first call may not have a cached token yet,
 * in which case it falls back to the API key.
 */
export function createOpenAIHeaderProvider(
  settings: AzureAIFoundryAuthSettings,
): () => Record<string, string> {
  let cachedToken: string | undefined;

  // Warm the cache if tokenProvider is available
  if (settings.tokenProvider) {
    settings.tokenProvider().then(token => {
      cachedToken = token;
    }).catch(() => {});
  }

  return () => {
    // Trigger background token refresh if tokenProvider is available
    if (settings.tokenProvider) {
      settings.tokenProvider().then(token => {
        cachedToken = token;
      }).catch(() => {});
    }

    const baseHeaders: Record<string, string | undefined> = {
      ...settings.headers,
    };

    if (cachedToken) {
      // Token provider takes precedence
      baseHeaders['Authorization'] = `Bearer ${cachedToken}`;
    } else {
      // Fall back to API key
      baseHeaders['api-key'] = loadApiKey({
        apiKey: settings.apiKey,
        environmentVariableName: 'AZURE_API_KEY',
        description: 'Azure AI Foundry',
      });
    }

    return withUserAgentSuffix(
      baseHeaders,
      `ai-sdk/azure-ai-foundry/${VERSION}`,
    );
  };
}

/**
 * Create an async-capable header provider for the Anthropic API path.
 *
 * This returns an async function compatible with the Resolvable type
 * used by the Anthropic model classes.
 */
export function createAnthropicHeaderProvider(
  settings: AzureAIFoundryAuthSettings,
): () => Promise<Record<string, string>> {
  const anthropicVersion = settings.anthropicVersion ?? '2023-06-01';

  return async () => {
    const baseHeaders: Record<string, string | undefined> = {
      'anthropic-version': anthropicVersion,
      ...settings.headers,
    };

    if (settings.tokenProvider) {
      // Token provider takes precedence
      const token = await settings.tokenProvider();
      baseHeaders['Authorization'] = `Bearer ${token}`;
    } else {
      // Fall back to API key
      baseHeaders['x-api-key'] = loadApiKey({
        apiKey: settings.apiKey,
        environmentVariableName: 'AZURE_API_KEY',
        description: 'Azure AI Foundry Anthropic',
      });
    }

    return withUserAgentSuffix(
      baseHeaders,
      `ai-sdk/azure-ai-foundry/${VERSION}`,
    );
  };
}
