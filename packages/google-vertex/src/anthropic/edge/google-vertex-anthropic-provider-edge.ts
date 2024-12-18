import {
  generateAuthToken,
  GoogleCredentials,
} from '../../edge/google-vertex-auth-edge';
import {
  createVertexAnthropic as createVertexAnthropicOriginal,
  GoogleVertexAnthropicProvider,
  GoogleVertexAnthropicProviderSettings as GoogleVertexAnthropicProviderSettingsOriginal,
} from '../google-vertex-anthropic-provider';

export type { GoogleVertexAnthropicProvider };

export interface GoogleVertexAnthropicProviderSettings
  extends GoogleVertexAnthropicProviderSettingsOriginal {
  /**
   * Optional. The Google credentials for the Google Cloud service account. If
   * not provided, the Google Vertex provider will use environment variables to
   * load the credentials.
   */
  googleCredentials?: GoogleCredentials;
}

export function createVertexAnthropic(
  options: GoogleVertexAnthropicProviderSettings = {},
): GoogleVertexAnthropicProvider {
  return createVertexAnthropicOriginal({
    ...options,
    headers:
      options.headers ??
      (async () => ({
        Authorization: `Bearer ${await generateAuthToken(
          options.googleCredentials,
        )}`,
      })),
  });
}

/**
 * Default Google Vertex AI Anthropic provider instance.
 */
export const vertexAnthropic = createVertexAnthropic();
