import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenResponses } from '@ai-sdk/open-responses';

export interface ConcentrateProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export interface ConcentrateProvider extends ProviderV4 {
  (modelId: string): LanguageModelV4;
  languageModel(modelId: string): LanguageModelV4;
  responses(modelId: string): LanguageModelV4;
  chat(modelId: string): LanguageModelV4;
}

export function createConcentrate(
  options: ConcentrateProviderSettings = {},
): ConcentrateProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.concentrate.ai/v1',
  )!;
  const getApiKey = () =>
    loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'CONCENTRATE_API_KEY',
      description: 'Concentrate AI API key',
    });
  const responses = (modelId: string) =>
    createOpenResponses({
      name: 'concentrate',
      url: `${baseURL}/responses`,
      apiKey: getApiKey(),
      headers: options.headers,
      fetch: options.fetch,
    })(modelId);
  const chat = (modelId: string) =>
    createOpenAICompatible({
      name: 'concentrate',
      baseURL,
      apiKey: getApiKey(),
      headers: options.headers,
      fetch: options.fetch,
      includeUsage: true,
      supportsStructuredOutputs: true,
    })(modelId);

  return Object.assign(responses, {
    specificationVersion: 'v4' as const,
    languageModel: responses,
    responses,
    chat,
    embeddingModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  }) as ConcentrateProvider;
}

export const concentrate = createConcentrate();
