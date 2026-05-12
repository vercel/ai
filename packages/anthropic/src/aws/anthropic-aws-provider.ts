import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadOptionalSetting,
  loadSetting,
  withoutTrailingSlash,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { createSigV4FetchFunction } from '@ai-sdk/provider-utils/aws';
import { AnthropicLanguageModel } from '../anthropic-language-model';
import type { AnthropicModelId } from '../anthropic-language-model-options';
import { anthropicTools } from '../anthropic-tools';
import {
  ANTHROPIC_AWS_USER_AGENT_SUFFIX,
  createApiKeyFetchFunction,
  type AnthropicAwsCredentials,
} from './anthropic-aws-fetch';

export interface AnthropicAwsProvider extends ProviderV4 {
  (modelId: AnthropicModelId): LanguageModelV4;

  languageModel(modelId: AnthropicModelId): LanguageModelV4;

  chat(modelId: AnthropicModelId): LanguageModelV4;

  messages(modelId: AnthropicModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;

  /**
   * Anthropic-specific computer use tool.
   */
  tools: typeof anthropicTools;
}

export interface AnthropicAwsProviderSettings {
  /**
   * AWS region for the Claude Platform on AWS endpoint. Defaults to the
   * `AWS_REGION` environment variable. Region is required; the constructor
   * throws if neither this setting nor the environment variable is set.
   */
  region?: string;

  /**
   * Anthropic workspace ID for this AWS account. Sent on every request via the
   * `anthropic-workspace-id` header. Defaults to the
   * `ANTHROPIC_AWS_WORKSPACE_ID` environment variable.
   */
  workspaceId?: string;

  /**
   * AWS-provisioned API key for `x-api-key` authentication. When provided,
   * this is used instead of AWS SigV4. Defaults to the
   * `ANTHROPIC_AWS_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * AWS access key ID for SigV4 authentication. Defaults to
   * `AWS_ACCESS_KEY_ID`. Ignored when `apiKey` is set.
   */
  accessKeyId?: string;

  /**
   * AWS secret access key for SigV4 authentication. Defaults to
   * `AWS_SECRET_ACCESS_KEY`. Ignored when `apiKey` is set.
   */
  secretAccessKey?: string;

  /**
   * AWS session token for SigV4 authentication. Defaults to
   * `AWS_SESSION_TOKEN`. Ignored when `apiKey` is set.
   */
  sessionToken?: string;

  /**
   * AWS credential provider that returns dynamic credentials at request time.
   * When set, its values override `accessKeyId`, `secretAccessKey`, and
   * `sessionToken`.
   */
  credentialProvider?: () => PromiseLike<
    Omit<AnthropicAwsCredentials, 'region'>
  >;

  /**
   * Override the base URL. Defaults to
   * `https://aws-external-anthropic.{region}.api.aws/v1`.
   */
  baseURL?: string;

  /**
   * Additional headers to include on every request.
   */
  headers?: Record<string, string | undefined>;

  /**
   * Custom fetch implementation. Useful for testing or as middleware.
   */
  fetch?: FetchFunction;

  generateId?: () => string;
}

/**
 * Create an Anthropic provider instance for Claude Platform on AWS. Uses the
 * Anthropic Messages API hosted in AWS at
 * `aws-external-anthropic.{region}.api.aws`, authenticated with AWS SigV4 or
 * an AWS-provisioned API key.
 */
export function createAnthropicAws(
  options: AnthropicAwsProviderSettings = {},
): AnthropicAwsProvider {
  const region = loadSetting({
    settingValue: options.region,
    settingName: 'region',
    environmentVariableName: 'AWS_REGION',
    description: 'AWS region',
  });

  const workspaceId = loadSetting({
    settingValue: options.workspaceId,
    settingName: 'workspaceId',
    environmentVariableName: 'ANTHROPIC_AWS_WORKSPACE_ID',
    description: 'Anthropic AWS workspace ID',
  });

  const apiKey = loadOptionalSetting({
    settingValue: options.apiKey,
    environmentVariableName: 'ANTHROPIC_AWS_API_KEY',
  });

  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    `https://aws-external-anthropic.${region}.api.aws/v1`;

  const fetchFunction = apiKey
    ? createApiKeyFetchFunction(apiKey, options.fetch)
    : createSigV4FetchFunction(
        async () => {
          if (options.credentialProvider) {
            return { ...(await options.credentialProvider()), region };
          }
          return {
            region,
            accessKeyId: loadSetting({
              settingValue: options.accessKeyId,
              settingName: 'accessKeyId',
              environmentVariableName: 'AWS_ACCESS_KEY_ID',
              description: 'AWS access key ID',
            }),
            secretAccessKey: loadSetting({
              settingValue: options.secretAccessKey,
              settingName: 'secretAccessKey',
              environmentVariableName: 'AWS_SECRET_ACCESS_KEY',
              description: 'AWS secret access key',
            }),
            sessionToken: loadOptionalSetting({
              settingValue: options.sessionToken,
              environmentVariableName: 'AWS_SESSION_TOKEN',
            }),
          };
        },
        {
          service: 'aws-external-anthropic',
          userAgentSuffix: ANTHROPIC_AWS_USER_AGENT_SUFFIX,
          fetch: options.fetch,
        },
      );

  const getHeaders = (): Record<string, string | undefined> => ({
    'anthropic-workspace-id': workspaceId,
    ...options.headers,
  });

  const createChatModel = (modelId: AnthropicModelId) =>
    new AnthropicLanguageModel(modelId, {
      provider: 'anthropic-aws.messages',
      baseURL,
      headers: getHeaders,
      fetch: fetchFunction,
      generateId: options.generateId,
      supportedUrls: () => ({
        'image/*': [/^https?:\/\/.*$/],
        'application/pdf': [/^https?:\/\/.*$/],
      }),
    });

  const provider = function (modelId: AnthropicModelId) {
    if (new.target) {
      throw new Error(
        'The Anthropic AWS model function cannot be called with the new keyword.',
      );
    }
    return createChatModel(modelId);
  };

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  provider.tools = anthropicTools;

  return provider;
}
