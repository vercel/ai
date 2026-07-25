import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { InterfazeChatLanguageModel } from './interfaze-chat-language-model';
import type { InterfazeChatModelId } from './interfaze-chat-language-model-options';
import { createInterfazeMetadataExtractor } from './interfaze-metadata-extractor';
import { resolveInterfazeVideoFileParts } from './interfaze-video-parts';
import { INTERFAZE_BASE_URL } from './side-channels';
import { VERSION } from './version';

const interfazeErrorSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
  param: z.any().nullish(),
  code: z.union([z.string(), z.number()]).nullish(),
});

export type InterfazeErrorData = z.infer<typeof interfazeErrorSchema>;

const interfazeErrorStructure: ProviderErrorStructure<InterfazeErrorData> = {
  errorSchema: interfazeErrorSchema,
  errorToMessage: data => data.message,
};

function transformInterfazeRequestBody(
  args: Record<string, any>,
): Record<string, any> {
  const resolved = resolveInterfazeVideoFileParts(args);
  if (resolved.precontext === undefined || Array.isArray(resolved.precontext)) {
    return resolved;
  }
  return { ...resolved, precontext: [resolved.precontext] };
}

export interface InterfazeProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export interface InterfazeProvider extends ProviderV4 {
  (modelId: InterfazeChatModelId): LanguageModelV4;
  languageModel(modelId: InterfazeChatModelId): LanguageModelV4;
  chat(modelId: InterfazeChatModelId): LanguageModelV4;
  textEmbeddingModel(modelId: string): never;
}

export function createInterfaze(
  options: InterfazeProviderSettings = {},
): InterfazeProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? INTERFAZE_BASE_URL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'INTERFAZE_API_KEY',
          description: 'Interfaze API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/interfaze/${VERSION}`,
    );

  const createLanguageModel = (modelId: InterfazeChatModelId) => {
    return new InterfazeChatLanguageModel(modelId, {
      provider: `interfaze.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: interfazeErrorStructure,
      supportsStructuredOutputs: true,
      transformRequestBody: transformInterfazeRequestBody,
      metadataExtractor: createInterfazeMetadataExtractor(),
      // Interfaze fetches video URLs server-side,
      // so pass URLs through instead of downloading them.
      supportedUrls: () => ({ 'video/*': [/^https:\/\/.+$/] }),
    });
  };

  const provider = (modelId: InterfazeChatModelId) =>
    createLanguageModel(modelId);

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

export const interfaze = createInterfaze();
