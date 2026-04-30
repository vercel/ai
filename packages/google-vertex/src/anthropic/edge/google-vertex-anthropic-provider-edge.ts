import { resolve } from '@ai-sdk/provider-utils';
import {
  generateAuthToken as defaultGenerateAuthToken,
  type GoogleCredentials,
} from '../../edge/google-vertex-auth-edge';
import {
  createVertexAnthropic as createVertexAnthropicOriginal,
  type GoogleVertexAnthropicProvider,
  type GoogleVertexAnthropicProviderSettings as GoogleVertexAnthropicProviderSettingsOriginal,
} from '../google-vertex-anthropic-provider';
export type { GoogleVertexAnthropicProvider };

export interface GoogleVertexAnthropicProviderSettings extends GoogleVertexAnthropicProviderSettingsOriginal {
  /**
   * Optional. The Google credentials for the Google Cloud service account. If
   * not provided, the Google Vertex provider will use environment variables to
   * load the credentials.
   */
  googleCredentials?: GoogleCredentials;
  /**
   * Optional. Custom function to obtain the Bearer token attached to outbound
   * requests. Defaults to performing the OAuth exchange with `googleCredentials`.
   * Override for tests, custom auth providers, or proxies that supply their
   * own auth.
   */
  generateAuthToken?: () => Promise<string>;
}

export function createVertexAnthropic(
  options: GoogleVertexAnthropicProviderSettings = {},
): GoogleVertexAnthropicProvider {
  const generateAuthToken =
    options.generateAuthToken ??
    (() => defaultGenerateAuthToken(options.googleCredentials));
  return createVertexAnthropicOriginal({
    ...options,
    headers: async () => ({
      Authorization: `Bearer ${await generateAuthToken()}`,
      ...(await resolve(options.headers)),
    }),
  });
}

/**
 * Default Google Vertex AI Anthropic provider instance.
 */
export const vertexAnthropic = createVertexAnthropic();
