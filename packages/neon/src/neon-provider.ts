import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  generateId,
  loadApiKey,
  loadSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { NeonAnthropicLanguageModel } from './neon-anthropic-language-model';
import { NeonChatLanguageModel } from './neon-chat-language-model';
import type { NeonChatModelId } from './neon-chat-options';
import { getNeonModelRoute } from './neon-model-capabilities';
import { NeonResponsesLanguageModel } from './neon-responses-language-model';
import { VERSION } from './version';

const neonErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.unknown().nullish(),
    code: z.unknown().nullish(),
  }),
});

export type NeonErrorData = z.infer<typeof neonErrorSchema>;

const neonErrorStructure: ProviderErrorStructure<NeonErrorData> = {
  errorSchema: neonErrorSchema,
  errorToMessage: data => data.error.message,
};

/**
 * Recursively remove the JSON Schema `$schema` marker.
 *
 * The AI SDK emits `$schema` in tool parameter schemas and structured-output
 * schemas. Some Neon AI Gateway backends (notably Gemini, whose function
 * declarations use an OpenAPI subset) reject unknown fields and fail the whole
 * request. Other backends simply ignore the marker, so stripping it everywhere
 * is safe and makes tool calling / structured outputs portable across models.
 */
function stripJsonSchemaMarker(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripJsonSchemaMarker);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === '$schema') {
        continue;
      }
      result[key] = stripJsonSchemaMarker(entry);
    }
    return result;
  }
  return value;
}

function transformNeonRequestBody(
  args: Record<string, any>,
): Record<string, any> {
  const transformed = { ...args };
  if (transformed.tools != null) {
    transformed.tools = stripJsonSchemaMarker(transformed.tools);
  }
  if (transformed.response_format != null) {
    transformed.response_format = stripJsonSchemaMarker(
      transformed.response_format,
    );
  }
  return transformed;
}

export interface NeonProviderSettings {
  /**
   * Neon AI Gateway base URL — the branch-scoped host root, e.g.
   * `https://<branch-id>-api.ai.<region>.aws.neon.tech`.
   *
   * The unified `/ai-gateway/mlflow/v1` path is appended internally, so only
   * the host (the value shown in the Neon Console's AI Gateway quickstart, up
   * to the domain) is required here.
   *
   * Falls back to the `NEON_AI_GATEWAY_BASE_URL` environment variable.
   */
  baseURL?: string;

  /**
   * Neon AI Gateway platform token — the `nt_live_...` value generated in the
   * Neon Console under the branch's AI Gateway tab.
   *
   * Falls back to the `NEON_AI_GATEWAY_TOKEN` environment variable.
   */
  apiKey?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface NeonProvider extends ProviderV4 {
  /**
   * Creates a Neon AI Gateway model for text generation.
   */
  (modelId: NeonChatModelId): LanguageModelV4;

  /**
   * Creates a Neon AI Gateway model for text generation.
   */
  languageModel(modelId: NeonChatModelId): LanguageModelV4;

  /**
   * Creates a Neon AI Gateway chat model for text generation.
   */
  chat(modelId: NeonChatModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export function createNeon(options: NeonProviderSettings = {}): NeonProvider {
  // Resolved lazily so that `createNeon()` and the default `neon` instance do
  // not throw at import time when configuration is supplied via the environment.
  const getHost = () =>
    withoutTrailingSlash(
      loadSetting({
        settingValue: options.baseURL,
        environmentVariableName: 'NEON_AI_GATEWAY_BASE_URL',
        settingName: 'baseURL',
        description: 'Neon AI Gateway base URL',
      }),
    );

  const getHeaders = (extra?: Record<string, string>) =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'NEON_AI_GATEWAY_TOKEN',
          description: 'Neon AI Gateway token',
        })}`,
        ...extra,
        ...options.headers,
      },
      `ai-sdk/neon/${VERSION}`,
    );

  // Anthropic models -> native Messages API (unlocks streaming structured
  // output and native reasoning for Claude).
  const createAnthropicModel = (modelId: NeonChatModelId) =>
    new NeonAnthropicLanguageModel(modelId, {
      provider: 'neon.anthropic',
      baseURL: `${getHost()}/ai-gateway/anthropic/v1`,
      headers: () => getHeaders({ 'anthropic-version': '2023-06-01' }),
      fetch: options.fetch,
      generateId,
    });

  // OpenAI models (incl. Codex, which is only served natively) -> Responses API.
  const createOpenAIModel = (modelId: NeonChatModelId) =>
    new NeonResponsesLanguageModel(modelId, {
      provider: 'neon.openai.responses',
      url: ({ path }) => `${getHost()}/ai-gateway/openai/v1${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      fileIdPrefixes: ['file-'],
    });

  // Everything else (Gemini, Llama, Qwen, gpt-oss, ...) -> unified, OpenAI-
  // compatible MLflow endpoint. Gemini is here because its native gateway
  // endpoint does not support streaming.
  const createChatModel = (modelId: NeonChatModelId) =>
    new NeonChatLanguageModel(modelId, {
      provider: 'neon.chat',
      url: ({ path }) => `${getHost()}/ai-gateway/mlflow/v1${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: neonErrorStructure,
      transformRequestBody: transformNeonRequestBody,
      // Use native structured outputs (`response_format: json_schema`) so
      // `generateObject` works without requiring the prompt to mention "json"
      // (the `json_object` fallback) and without a separate tool round-trip.
      supportsStructuredOutputs: true,
      // The gateway returns token usage in streaming chunks natively, and
      // forwarding `stream_options` to provider-native backends is rejected.
      // So we intentionally do not opt into `include_usage`.
    });

  const createLanguageModel = (modelId: NeonChatModelId): LanguageModelV4 => {
    switch (getNeonModelRoute(modelId)) {
      case 'anthropic':
        return createAnthropicModel(modelId);
      case 'openai':
        return createOpenAIModel(modelId);
      default:
        return createChatModel(modelId);
    }
  };

  const provider = (modelId: NeonChatModelId) => createLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const neon = createNeon();
