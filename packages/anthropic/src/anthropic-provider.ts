import {
  LanguageModelV3,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  loadOptionalSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { VERSION } from './version';
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';
import {
  AnthropicMessagesModelId,
  AnthropicSearchToolDefinition,
} from './anthropic-messages-options';
import { anthropicTools } from './anthropic-tools';
import {
  RegisteredRuntimeTool,
  toolSearchRegistry,
} from './runtime/tool-search/registry';
import { createSearchToolDefinition } from './search-tool-definition';

export interface AnthropicProvider extends ProviderV3 {
  /**
Creates a model for text generation.
*/
  (modelId: AnthropicMessagesModelId): LanguageModelV3;

  /**
Creates a model for text generation.
*/
  languageModel(modelId: AnthropicMessagesModelId): LanguageModelV3;

  chat(modelId: AnthropicMessagesModelId): LanguageModelV3;

  messages(modelId: AnthropicMessagesModelId): LanguageModelV3;

  /**
Anthropic-specific computer use tool.
   */
  tools: typeof anthropicTools;

  searchTool: (
    def: Omit<AnthropicSearchToolDefinition, 'type'>,
  ) => AnthropicSearchToolDefinition;

  advancedTools: {
    register: (tool: {
      name: string;
      description?: string;
      inputSchema?: any;
      keywords?: string[];
      allowedCallers?: string[];
      examples?: unknown[];
    }) => void;
    list: () => RegisteredRuntimeTool[];
  };
}

export interface AnthropicProviderSettings {
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
  fetch?: FetchFunction;

  generateId?: () => string;

  /**
   * Custom provider name
   * Defaults to 'anthropic.messages'.
   */
  name?: string;

  /**
   * Enables Anthropic's Advanced Tool Use features:
   * - Tool Search Tool
   * - Programmatic Tool Calling
   * - Tool Use Examples
   *
   * When enabled, adds:
   *   "anthropic-beta": "advanced-tool-use-2025-11-20"
   */
  advancedToolUse?: boolean;
}

/**
Create an Anthropic provider instance.
 */
export function createAnthropic(
  options: AnthropicProviderSettings = {},
): AnthropicProvider {
  const baseURL =
    withoutTrailingSlash(
      loadOptionalSetting({
        settingValue: options.baseURL,
        environmentVariableName: 'ANTHROPIC_BASE_URL',
      }),
    ) ?? 'https://api.anthropic.com/v1';

  const providerName = options.name ?? 'anthropic.messages';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'anthropic-version': '2023-06-01',
        'x-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ANTHROPIC_API_KEY',
          description: 'Anthropic',
        }),
        ...(options.advancedToolUse
          ? { 'anthropic-beta': 'advanced-tool-use-2025-11-20' }
          : {}),
        ...options.headers,
      },
      `ai-sdk/anthropic/${VERSION}`,
    );

  const createChatModel = (modelId: AnthropicMessagesModelId) =>
    new AnthropicMessagesLanguageModel(modelId, {
      provider: providerName,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: options.generateId ?? generateId,
      supportedUrls: () => ({
        'image/*': [/^https?:\/\/.*$/],
      }),
    });

  const provider = function (modelId: AnthropicMessagesModelId) {
    if (new.target) {
      throw new Error(
        'The Anthropic model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  provider.tools = anthropicTools;

  provider.searchTool = (def: any) => {
    const built = createSearchToolDefinition(def);

    toolSearchRegistry.register({
      name: built.name,
      description: built.query,
      inputSchema: {},
      keywords: built.inputExamples?.map(String) ?? [],
      allowedCallers: built.allowedCallers ?? [],
      examples: built.inputExamples ?? [],
    });

    return built;
  };

  provider.advancedTools = {
    register: (tool: any) => {
      toolSearchRegistry.register({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema ?? {},
        keywords: tool.keywords ?? [],
        allowedCallers: tool.allowedCallers ?? [],
        examples: tool.examples ?? [],
      });
    },
    list: toolSearchRegistry.list.bind(toolSearchRegistry),
  };

  return provider;
}

/**
Default Anthropic provider instance.
 */
export const anthropic = createAnthropic();
