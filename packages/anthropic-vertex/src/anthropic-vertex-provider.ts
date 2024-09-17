import { loadApiKey, loadSetting, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { GoogleAuth, GoogleAuthOptions } from 'google-auth-library';
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';
import {
  AnthropicMessagesModelId,
  AnthropicMessagesSettings,
} from './anthropic-messages-settings';

export interface AnthropicVertexProvider {
  /**
Creates a model for text generation.
*/
  (
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): AnthropicMessagesLanguageModel;

  /**
Creates a model for text generation.
*/
  languageModel(
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): AnthropicMessagesLanguageModel;

  /**
Creates a model for text generation.
*/
  chat(
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): AnthropicMessagesLanguageModel;
}

export interface AnthropicVertexProviderSettings {
  /**
Your Google Vertex region. Defaults to the environment variable `GOOGLE_VERTEX_REGION`.
   */
  region?: string;

  /**
Your Google Vertex project. Defaults to the environment variable `GOOGLE_VERTEX_PROJECT_ID`.
  */
  projectId?: string;

  /**
 Optional. The Authentication options provided by google-auth-library.
Complete list of authentication options is documented in the
GoogleAuthOptions interface:
https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts.
   */
  googleAuth?: GoogleAuth;

  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.anthropic.com/v1`.
   */
  baseURL?: string;

  /**
API key that is being send using the `x-api-key` header.
It defaults to the `ANTHROPIC_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: typeof fetch;

  generateId?: () => string;
}

/**
Create an Anthropic provider instance.
 */
export function createAnthropicVertex(
  options: AnthropicVertexProviderSettings = {},
): AnthropicVertexProvider {

  const config = {
    projectId: loadSetting({
      settingValue: options.projectId,
      settingName: 'projectId',
      environmentVariableName: 'GOOGLE_VERTEX_PROJECT_ID',
      description: 'Google Vertex project id',
    }),
    region: loadSetting({
      settingValue: options.region,
      settingName: 'region',
      environmentVariableName: 'GOOGLE_VERTEX_REGION',
      description: 'Google Vertex region',
    }),
    googleAuth: options.googleAuth,
  };

  if (!config.region) {
    throw new Error(
      'No region was given. The client should be instantiated with the `region` option or the `GOOGLE_VERTEX_REGION` environment variable should be set.',
    );
  }
  
  if(!config.projectId) {
    throw new Error(
      'No project was given. The client should be instantiated with the `projectID` option or the `GOOGLE_VERTEX_PROJECT_ID` environment variable should be set.',
    );
  }

  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    `https://${config.region}-aiplatform.googleapis.com/v1`;

  const auth =
    options.googleAuth ?? new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });

  // const token = await auth.getAccessToken()

  const DEFAULT_VERSION = 'vertex-2023-10-16';

  // const getHeaders = () => ({
  //   'x-api-key': loadApiKey({
  //     apiKey: options.apiKey,
  //     environmentVariableName: 'ANTHROPIC_API_KEY',
  //     description: 'Anthropic',
  //   }),
  //   ...options.headers,
  // });
// 

  const createChatModel = (
    modelId: AnthropicMessagesModelId,
    settings: AnthropicMessagesSettings = {},
  ) =>
    new AnthropicMessagesLanguageModel(modelId, settings, {
      provider: 'anthropic.messages',
      baseURL,
      headers: () => ({
        ...options.headers
      }),
      fetch: options.fetch,
      projectId: config.projectId,
      region: config.region,
      googleAuth: auth
    });

  const provider = function (
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Anthropic model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;

  return provider as AnthropicVertexProvider;
}

/**
Default Anthropic provider instance.
 */
export const anthropicVertex = createAnthropicVertex();
