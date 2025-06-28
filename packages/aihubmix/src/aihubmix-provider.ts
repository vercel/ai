import {
  OpenAIChatLanguageModel,
  OpenAIChatSettings,
  OpenAICompletionLanguageModel,
  OpenAICompletionSettings,
  OpenAIEmbeddingModel,
  OpenAIEmbeddingSettings,
  OpenAIImageModel,
  OpenAIImageSettings,
  OpenAIResponsesLanguageModel,
  OpenAITranscriptionModel,
  OpenAISpeechModel,
} from '@ai-sdk/openai/internal';
import {
  AnthropicMessagesLanguageModel,
  AnthropicMessagesSettings,
} from '@ai-sdk/anthropic/internal';
import {
  InternalGoogleGenerativeAISettings,
  GoogleGenerativeAILanguageModel,
} from '@ai-sdk/google/internal';
import {
  EmbeddingModelV1,
  LanguageModelV1,
  ProviderV1,
  ImageModelV1,
  TranscriptionModelV1,
} from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { openaiTools } from './aihubmix-tools';

export interface AihubmixProvider extends ProviderV1 {
  (deploymentId: string, settings?: OpenAIChatSettings): LanguageModelV1;

  languageModel(
    deploymentId: string,
    settings?: OpenAIChatSettings,
  ): LanguageModelV1;

  chat(deploymentId: string, settings?: OpenAIChatSettings): LanguageModelV1;

  responses(deploymentId: string): LanguageModelV1;

  completion(
    deploymentId: string,
    settings?: OpenAICompletionSettings,
  ): LanguageModelV1;

  embedding(
    deploymentId: string,
    settings?: OpenAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  image(deploymentId: string, settings?: OpenAIImageSettings): ImageModelV1;

  imageModel(
    deploymentId: string,
    settings?: OpenAIImageSettings,
  ): ImageModelV1;

  textEmbedding(
    deploymentId: string,
    settings?: OpenAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  textEmbeddingModel(
    deploymentId: string,
    settings?: OpenAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  transcription(deploymentId: string): TranscriptionModelV1;
}

export interface AihubmixProviderSettings {
  apiKey?: string;
}

export function createAihubmix(
  options: AihubmixProviderSettings = {},
): AihubmixProvider {
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AIHUBMIX_API_KEY',
      description: 'Aihubmix',
    })}`,
    'APP-Code': 'WHVL9885',
    'Content-Type': 'application/json',
  });

  const url = ({ path, modelId }: { path: string; modelId: string }) => {
    const baseURL = 'https://aihubmix.com/v1';
    return `${baseURL}${path}`;
  };

  const createChatModel = (
    deploymentName: string,
    settings: OpenAIChatSettings = {},
  ) => {
    const headers = getHeaders();
    if (deploymentName.startsWith('claude-')) {
      return new AnthropicMessagesLanguageModel(
        deploymentName,
        settings as AnthropicMessagesSettings,
        {
          provider: 'aihubmix.chat',
          baseURL: url({ path: '', modelId: deploymentName }),
          headers: {
            ...headers,
            'x-api-key': headers['Authorization'].split(' ')[1],
          },
          supportsImageUrls: true,
        },
      );
    }
    if (
      (deploymentName.startsWith('gemini') ||
        deploymentName.startsWith('imagen')) &&
      !deploymentName.endsWith('-nothink') &&
      !deploymentName.endsWith('-search')
    ) {
      return new GoogleGenerativeAILanguageModel(
        deploymentName,
        settings as InternalGoogleGenerativeAISettings,
        {
          provider: 'aihubmix.chat',
          baseURL: 'https://aihubmix.com/gemini/v1beta',
          headers: {
            ...headers,
            'x-goog-api-key': headers['Authorization'].split(' ')[1],
          },
          generateId: () => `aihubmix-${Date.now()}`,
          isSupportedUrl: () => true,
        },
      );
    }

    return new OpenAIChatLanguageModel(deploymentName, settings, {
      provider: 'aihubmix.chat',
      url,
      headers: getHeaders,
      compatibility: 'strict',
    });
  };

  const createCompletionModel = (
    modelId: string,
    settings: OpenAICompletionSettings = {},
  ) =>
    new OpenAICompletionLanguageModel(modelId, settings, {
      provider: 'aihubmix.completion',
      url,
      compatibility: 'strict',
      headers: getHeaders,
    });

  const createEmbeddingModel = (
    modelId: string,
    settings: OpenAIEmbeddingSettings = {},
  ) => {
    return new OpenAIEmbeddingModel(modelId, settings, {
      provider: 'aihubmix.embeddings',
      headers: getHeaders,
      url,
    });
  };

  const createResponsesModel = (modelId: string) =>
    new OpenAIResponsesLanguageModel(modelId, {
      provider: 'aihubmix.responses',
      url,
      headers: getHeaders,
    });

  const createImageModel = (
    modelId: string,
    settings: OpenAIImageSettings = {},
  ) => {
    return new OpenAIImageModel(modelId, settings, {
      provider: 'aihubmix.image',
      url,
      headers: getHeaders,
    });
  };

  const createTranscriptionModel = (modelId: string) =>
    new OpenAITranscriptionModel(modelId, {
      provider: 'aihubmix.transcription',
      url,
      headers: getHeaders,
    });
  const createSpeechModel = (modelId: string) =>
    new OpenAISpeechModel(modelId, {
      provider: 'aihubmix.speech',
      url,
      headers: getHeaders,
    });
  const provider = function (
    deploymentId: string,
    settings?: OpenAIChatSettings | OpenAICompletionSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Aihubmix model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(deploymentId, settings as OpenAIChatSettings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.completion = createCompletionModel;
  provider.responses = createResponsesModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  provider.image = createImageModel;
  provider.imageModel = createImageModel;

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  provider.tools = openaiTools;

  return provider as AihubmixProvider;
}

export const aihubmix = createAihubmix();
