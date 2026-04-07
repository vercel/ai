import {
  loadApiKey,
  loadOptionalSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { VERSION } from './version';

/**
 * Creates OpenAI auth headers. Used by both the provider factory and
 * WORKFLOW_DESERIALIZE so the auth logic lives in a single place.
 */
export function createOpenAIHeaders(options?: {
  apiKey?: string;
  organization?: string;
  project?: string;
  headers?: Record<string, string | undefined>;
}): Record<string, string | undefined> {
  return withUserAgentSuffix(
    {
      Authorization: `Bearer ${loadApiKey({
        apiKey: options?.apiKey,
        environmentVariableName: 'OPENAI_API_KEY',
        description: 'OpenAI',
      })}`,
      'OpenAI-Organization': options?.organization,
      'OpenAI-Project': options?.project,
      ...options?.headers,
    },
    `ai-sdk/openai/${VERSION}`,
  );
}

/**
 * Creates the default OpenAI URL resolver. Used by WORKFLOW_DESERIALIZE
 * to reconstruct the url function stripped during serialization.
 */
export function createOpenAIURL(options?: {
  baseURL?: string;
}): (opts: { modelId: string; path: string }) => string {
  const baseURL =
    withoutTrailingSlash(
      loadOptionalSetting({
        settingValue: options?.baseURL,
        environmentVariableName: 'OPENAI_BASE_URL',
      }),
    ) ?? 'https://api.openai.com/v1';
  return ({ path }) => `${baseURL}${path}`;
}
