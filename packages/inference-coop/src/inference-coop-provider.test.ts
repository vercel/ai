import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createInferenceCoop } from './inference-coop-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleImageModel,
} from '@ai-sdk/openai-compatible';

const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;
const OpenAICompatibleImageModelMock =
  OpenAICompatibleImageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
  OpenAICompatibleImageModel: vi.fn(),
}));

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    withoutTrailingSlash: vi.fn(url => url),
  };
});

describe('createInferenceCoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the co-op gateway endpoint and INFERENCE_COOP_API_KEY', () => {
    const provider = createInferenceCoop();
    provider('greenpt/deepseek-v4.1-flash');

    const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    const headers = config.headers!();

    expect(config.provider).toBe('inference-coop.chat');
    expect(config.baseURL).toBe('https://gateway.inference.coop/v1');
    expect(config.url({ path: '/chat/completions' })).toBe(
      'https://gateway.inference.coop/v1/chat/completions',
    );
    expect(loadApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentVariableName: 'INFERENCE_COOP_API_KEY',
      }),
    );
    expect(headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer mock-api-key',
        'user-agent': 'ai-sdk-inference-coop/0.0.0-test',
      }),
    );
  });

  it('requests usage for streaming calls', () => {
    const provider = createInferenceCoop();
    provider.chat('greenpt/deepseek-v4.1-flash');

    const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    expect(config.includeUsage).toBe(true);
  });

  it('respects a custom baseURL', () => {
    const provider = createInferenceCoop({
      baseURL: 'https://example.com/coop',
    });
    provider('model');

    const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    expect(config.url({ path: '/chat/completions' })).toBe(
      'https://example.com/coop/chat/completions',
    );
  });

  it('creates an image model for the /images/generations endpoint', () => {
    const provider = createInferenceCoop();
    provider.image('regolo/qwen-image');

    const config = OpenAICompatibleImageModelMock.mock.calls[0][1];
    expect(config.provider).toBe('inference-coop.image');
    expect(config.baseURL).toBe('https://gateway.inference.coop/v1');
    expect(config.url({ path: '/images/generations' })).toBe(
      'https://gateway.inference.coop/v1/images/generations',
    );
  });

  it('creates transcription and speech models with their provider strings', () => {
    const provider = createInferenceCoop();

    const transcription = provider.transcription(
      'tinfoil/whisper-large-v3-turbo',
    );
    expect(transcription.provider).toBe('inference-coop.transcription');
    expect(transcription.modelId).toBe('tinfoil/whisper-large-v3-turbo');
    expect(transcription.specificationVersion).toBe('v4');

    const speech = provider.speech('tinfoil/voxtral-tts');
    expect(speech.provider).toBe('inference-coop.speech');
    expect(speech.modelId).toBe('tinfoil/voxtral-tts');
    expect(speech.specificationVersion).toBe('v4');
  });

  it('throws NoSuchModelError for embedding models', () => {
    const provider = createInferenceCoop();
    expect(() => provider.embeddingModel('model')).toThrow(/embeddingModel/);
  });
});
