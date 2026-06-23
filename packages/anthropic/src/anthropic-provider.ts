import {
  InvalidArgumentError,
  NoSuchModelError,
  type FilesV4,
  type LanguageModelV4,
  type ProviderV4,
  type SkillsV4,
} from '@ai-sdk/provider';
import {
  generateId,
  loadApiKey,
  loadOptionalSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { AnthropicFiles } from './anthropic-files';
import { AnthropicLanguageModel } from './anthropic-language-model';
import type { AnthropicModelId } from './anthropic-language-model-options';
import { anthropicTools } from './anthropic-tools';
import { AnthropicSkills } from './skills/anthropic-skills';
import { VERSION } from './version';

export interface AnthropicProvider extends ProviderV4 {
  /**
   * Creates a model for text generation.
   */
  (modelId: AnthropicModelId): LanguageModelV4;

  /**
   * Creates a model for text generation.
   */
  languageModel(modelId: AnthropicModelId): LanguageModelV4;

  chat(modelId: AnthropicModelId): LanguageModelV4;

  messages(modelId: AnthropicModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;

  files(): FilesV4;

  /**
   * Returns a SkillsV4 interface for uploading skills to Anthropic.
   */
  skills(): SkillsV4;

  /**
   * Anthropic-specific computer use tool.
   */
  tools: typeof anthropicTools;
}

export interface AnthropicProviderSettings {
  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers.
   * The default prefix is `https://api.anthropic.com/v1`.
   *
   * Also accepts the bare-host form (`https://api.anthropic.com`) for
   * compatibility with Claude Code, Cursor, and LiteLLM, which follow the
   * `@anthropic-ai/sdk` convention of injecting a base URL without `/v1`.
   * The `/v1` suffix is appended automatically when missing.
   */
  baseURL?: string;

  /**
   * API key that is being send using the `x-api-key` header.
   * It defaults to the `ANTHROPIC_API_KEY` environment variable.
   * Only one of `apiKey` or `authToken` is required.
   */
  apiKey?: string;

  /**
   * Auth token that is being sent using the `Authorization: Bearer` header.
   * It defaults to the `ANTHROPIC_AUTH_TOKEN` environment variable.
   * Only one of `apiKey` or `authToken` is required.
   */
  authToken?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  generateId?: () => string;

  /**
   * Custom provider name
   * Defaults to 'anthropic.messages'.
   */
  name?: string;
}

/**
 * Normalize an Anthropic base URL so it always ends with `/v1`.
 *
 * Claude Code, Cursor, and LiteLLM inject `ANTHROPIC_BASE_URL` as a bare
 * host (`https://api.anthropic.com`) following the `@anthropic-ai/sdk`
 * convention. This helper accepts both forms and always returns the `/v1`
 * form, preventing silent 404 errors in those environments.
 *
 * Examples:
 *   https://api.anthropic.com        -> https://api.anthropic.com/v1
 *   https://api.anthropic.com/v1     -> https://api.anthropic.com/v1
 *   https://api.anthropic.com/v1/    -> https://api.anthropic.com/v1
 *   https://my.proxy.com             -> https://my.proxy.com/v1
 *   https://my.proxy.com/v1          -> https://my.proxy.com/v1
 */
export function normalizeAnthropicBaseURL(url: string): string {
  // Remove trailing slashes first, then remove a trailing /v1 if present,
  // so we can always append exactly one /v1.
  const stripped = url.replace(/\/+$/, '').replace(/\/v1$/, '');
  return `${stripped}/v1`;
}

/**
 * Create an Anthropic provider instance.
 */
export function createAnthropic(
  options: AnthropicProviderSettings = {},
): AnthropicProvider {
  const rawBaseURL =
    withoutTrailingSlash(
      loadOptionalSetting({
        settingValue: options.baseURL,
        environmentVariableName: 'ANTHROPIC_BASE_URL',
      }),
    ) ?? 'https://api.anthropic.com/v1';

  // Normalize to always include /v1, accepting both the bare-host form
  // (https://api.anthropic.com) and the /v1 form as input.
  const baseURL = normalizeAnthropicBaseURL(rawBaseURL);

  const providerName = options.name ?? 'anthropic.messages';

  // Only error if both are explicitly provided in options
  if (options.apiKey && options.authToken) {
    throw new InvalidArgumentError({
      argument: 'apiKey/authToken',
      message:
        'Both apiKey and authToken were provided. Please use only one authentication method.',
    });
  }

  const getHeaders = () => {
    const authHeaders: Record<string, string> = options.authToken
      ? { Authorization: `Bearer ${options.authToken}` }
      : {
          'x-api-key': loadApiKey({
            apiKey: options.apiKey,
            environmentVariableName: 'ANTHROPIC_API_KEY',
            description: 'Anthropic',
          }),
        };

    return withUserAgentSuffix(
      {
        'anthropic-version': '2023-06-01',
        ...authHeaders,
        ...options.headers,
      },
      `ai-sdk/anthropic/${VERSION}`,
    );
  };

  const createChatModel = (modelId: AnthropicModelId) =>
    new AnthropicLanguageModel(modelId, {
      provider: providerName,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: options.generateId ?? generateId,
      supportedUrls: () => ({
        'image/*': [/^https?:\/\/.*$/],
        'application/pdf': [/^https?:\/\/.*$/],
      }),
    });

  const createSkills = () =>
    new AnthropicSkills({
      provider: `${providerName.replace('.messages', '')}.skills`,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: AnthropicModelId) {
    if (new.target) {
      throw new Error(
        'The Anthropic model function cannot be called with the new keyword.',
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

  provider.files = () =>
    new AnthropicFiles({
      provider: providerName,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  provider.skills = createSkills;

  provider.tools = anthropicTools;

  return provider;
}

/**
 * Default Anthropic provider instance.
 */
export const anthropic = createAnthropic();
