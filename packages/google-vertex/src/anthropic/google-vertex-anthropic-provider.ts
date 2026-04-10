import {
  LanguageModelV4,
  NoSuchModelError,
  ProviderV4,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  loadOptionalSetting,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import {
  anthropicTools,
  AnthropicMessagesLanguageModel,
} from '@ai-sdk/anthropic/internal';
import { GoogleVertexAnthropicMessagesModelId } from './google-vertex-anthropic-messages-options';

/**
 * Tools supported by Google Vertex Anthropic.
 * This is a subset of the full Anthropic tools - only these are recognized by the Vertex API.
 */
export const vertexAnthropicTools = {
  /**
   * The bash tool enables Claude to execute shell commands in a persistent bash session,
   * allowing system operations, script execution, and command-line automation.
   *
   * Image results are supported.
   */
  bash_20241022: anthropicTools.bash_20241022,

  /**
   * The bash tool enables Claude to execute shell commands in a persistent bash session,
   * allowing system operations, script execution, and command-line automation.
   *
   * Image results are supported.
   */
  bash_20250124: anthropicTools.bash_20250124,

  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents.
   *
   * Supported models: Claude Sonnet 3.5
   */
  textEditor_20241022: anthropicTools.textEditor_20241022,

  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents.
   *
   * Supported models: Claude Sonnet 3.7
   */
  textEditor_20250124: anthropicTools.textEditor_20250124,

  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files.
   * Note: This version does not support the "undo_edit" command.
   * @deprecated Use textEditor_20250728 instead
   */
  textEditor_20250429: anthropicTools.textEditor_20250429,

  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files.
   * Note: This version does not support the "undo_edit" command and adds optional max_characters parameter.
   * Supported models: Claude Sonnet 4, Opus 4, and Opus 4.1
   */
  textEditor_20250728: anthropicTools.textEditor_20250728,

  /**
   * Claude can interact with computer environments through the computer use tool, which
   * provides screenshot capabilities and mouse/keyboard control for autonomous desktop interaction.
   *
   * Image results are supported.
   */
  computer_20241022: anthropicTools.computer_20241022,

  /**
   * Creates a web search tool that gives Claude direct access to real-time web content.
   */
  webSearch_20250305: anthropicTools.webSearch_20250305,

  /**
   * Creates a tool search tool that uses regex patterns to find tools.
   *
   * The tool search tool enables Claude to work with hundreds or thousands of tools
   * by dynamically discovering and loading them on-demand.
   *
   * Use `providerOptions: { anthropic: { deferLoading: true } }` on other tools
   * to mark them for deferred loading.
   */
  toolSearchRegex_20251119: anthropicTools.toolSearchRegex_20251119,

  /**
   * Creates a tool search tool that uses BM25 (natural language) to find tools.
   *
   * The tool search tool enables Claude to work with hundreds or thousands of tools
   * by dynamically discovering and loading them on-demand.
   *
   * Use `providerOptions: { anthropic: { deferLoading: true } }` on other tools
   * to mark them for deferred loading.
   */
  toolSearchBm25_20251119: anthropicTools.toolSearchBm25_20251119,
};
export interface GoogleVertexAnthropicProvider extends ProviderV4 {
  /**
   * Creates a model for text generation.
   */
  (modelId: GoogleVertexAnthropicMessagesModelId): LanguageModelV4;

  /**
   * Creates a model for text generation.
   */
  languageModel(modelId: GoogleVertexAnthropicMessagesModelId): LanguageModelV4;

  /**
   * Anthropic tools supported by Google Vertex.
   * Note: Only a subset of Anthropic tools are available on Vertex.
   * Supported tools: bash_20241022, bash_20250124, textEditor_20241022,
   * textEditor_20250124, textEditor_20250429, textEditor_20250728,
   * computer_20241022, webSearch_20250305, toolSearchRegex_20251119,
   * toolSearchBm25_20251119
   */
  tools: typeof vertexAnthropicTools;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface GoogleVertexAnthropicProviderSettings {
  /**
   * Google Cloud project ID. Defaults to the value of the `GOOGLE_VERTEX_PROJECT` environment variable.
   */
  project?: string;

  /**
   * Google Cloud region. Defaults to the value of the `GOOGLE_VERTEX_LOCATION` environment variable.
   */
  location?: string;

  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers.
   * The default prefix is `https://api.anthropic.com/v1`.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Resolvable<Record<string, string | undefined>>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
 * Distributes a top-level `cache_control` value to the last cacheable content
 * block in the messages array. Targets the message immediately before the last
 * user message (the stable conversation prefix), falling back to the last
 * system message block if there is no prior message.
 *
 * This replicates Anthropic's automatic caching semantics in a way that
 * Vertex's strict input validation accepts.
 */
function distributeCacheControlToMessages(
  body: Record<string, unknown>,
  cacheControl: unknown,
): void {
  const messages = body.messages as
    | Array<{ role: string; content: unknown }>
    | undefined;

  // Find the last user message index
  let lastUserIndex = -1;
  if (messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
  }

  // Target the message before the last user message
  const targetIndex = lastUserIndex > 0 ? lastUserIndex - 1 : -1;

  if (targetIndex >= 0 && messages) {
    const targetMessage = messages[targetIndex];
    applyCacheControlToMessage(targetMessage, cacheControl);
    return;
  }

  // Fall back to the last system message block
  const system = body.system as
    | Array<{ type: string; cache_control?: unknown }>
    | undefined;
  if (system && system.length > 0) {
    const lastSystemBlock = system[system.length - 1];
    if (lastSystemBlock.cache_control == null) {
      lastSystemBlock.cache_control = cacheControl;
    }
  }
}

/**
 * Applies cache_control to the last content block of a message,
 * only if that block doesn't already have cache_control set.
 */
function applyCacheControlToMessage(
  message: { role: string; content: unknown },
  cacheControl: unknown,
): void {
  const content = message.content;
  if (Array.isArray(content) && content.length > 0) {
    const lastBlock = content[content.length - 1];
    if (lastBlock.cache_control == null) {
      lastBlock.cache_control = cacheControl;
    }
  }
}

/**
 * Create a Google Vertex Anthropic provider instance.
 */
export function createVertexAnthropic(
  options: GoogleVertexAnthropicProviderSettings = {},
): GoogleVertexAnthropicProvider {
  const getBaseURL = () => {
    const location = loadOptionalSetting({
      settingValue: options.location,
      environmentVariableName: 'GOOGLE_VERTEX_LOCATION',
    });
    const project = loadOptionalSetting({
      settingValue: options.project,
      environmentVariableName: 'GOOGLE_VERTEX_PROJECT',
    });

    return (
      withoutTrailingSlash(options.baseURL) ??
      `https://${location === 'global' ? '' : location + '-'}aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/anthropic/models`
    );
  };

  const createChatModel = (modelId: GoogleVertexAnthropicMessagesModelId) =>
    new AnthropicMessagesLanguageModel(modelId, {
      provider: 'vertex.anthropic.messages',
      baseURL: getBaseURL(),
      headers: options.headers ?? {},
      fetch: options.fetch,

      buildRequestUrl: (baseURL, isStreaming) =>
        `${baseURL}/${modelId}:${
          isStreaming ? 'streamRawPredict' : 'rawPredict'
        }`,
      transformRequestBody: args => {
        // Remove model from args and add anthropic version
        const { model, cache_control, ...rest } = args;

        const body: Record<string, unknown> = {
          ...rest,
          anthropic_version: 'vertex-2023-10-16',
        };

        // Vertex Anthropic rejects top-level cache_control. Translate it to
        // message-level cache_control on the last cacheable content block
        // before the final user turn, matching Anthropic's automatic caching
        // semantics.
        if (cache_control != null) {
          distributeCacheControlToMessages(body, cache_control);
        }

        return body;
      },
      // Google Vertex Anthropic doesn't support URL sources, force download and base64 conversion
      supportedUrls: () => ({}),
      // force the use of JSON tool fallback for structured outputs since beta header isn't supported
      supportsNativeStructuredOutput: false,
      // Vertex Anthropic doesn't support strict mode on tool definitions.
      supportsStrictTools: false,
    });

  const provider = function (modelId: GoogleVertexAnthropicMessagesModelId) {
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

  provider.tools = vertexAnthropicTools;

  return provider;
}
