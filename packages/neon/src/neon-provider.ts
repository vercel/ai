import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  loadSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { NeonChatLanguageModel } from './neon-chat-language-model';
import type { NeonChatModelId } from './neon-chat-options';
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

// Unified, OpenAI-compatible surface served by the Neon AI Gateway. Keeping the
// path internal lets the env-configured base URL stay as the bare branch host.
const MLFLOW_PATH = '/ai-gateway/mlflow/v1';

export function createNeon(options: NeonProviderSettings = {}): NeonProvider {
  // Resolved lazily so that `createNeon()` and the default `neon` instance do
  // not throw at import time when configuration is supplied via the environment.
  const getBaseURL = () =>
    `${withoutTrailingSlash(
      loadSetting({
        settingValue: options.baseURL,
        environmentVariableName: 'NEON_AI_GATEWAY_BASE_URL',
        settingName: 'baseURL',
        description: 'Neon AI Gateway base URL',
      }),
    )}${MLFLOW_PATH}`;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'NEON_AI_GATEWAY_TOKEN',
          description: 'Neon AI Gateway token',
        })}`,
        ...options.headers,
      },
      `ai-sdk/neon/${VERSION}`,
    );

  const createLanguageModel = (modelId: NeonChatModelId) =>
    new NeonChatLanguageModel(modelId, {
      provider: 'neon.chat',
      url: ({ path }) => `${getBaseURL()}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: neonErrorStructure,
      // The gateway returns token usage in streaming chunks natively, and
      // forwarding `stream_options` to provider-native backends (e.g. Gemini)
      // is rejected. So we intentionally do not opt into `include_usage`.
    });

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
