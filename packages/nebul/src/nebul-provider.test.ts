import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createNebul } from './nebul-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
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

describe('createNebul', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the Nebul endpoint and NEBUL_API_KEY', () => {
    const provider = createNebul();
    provider('mistralai/Mistral-7B-Instruct-v0.3');

    const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    const headers = config.headers!();

    expect(config.provider).toBe('nebul.chat');
    expect(config.url({ path: '/chat/completions' })).toBe(
      'https://api.inference.nebul.io/v1/chat/completions',
    );
    expect(loadApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ environmentVariableName: 'NEBUL_API_KEY' }),
    );
    expect(headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer mock-api-key',
        'user-agent': 'ai-sdk/nebul/0.0.0-test',
      }),
    );
  });

  it('respects a custom baseURL', () => {
    const provider = createNebul({
      baseURL: 'https://custom.nebul.endpoint/v1',
    });
    provider('model');

    const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    expect(config.url({ path: '/chat/completions' })).toBe(
      'https://custom.nebul.endpoint/v1/chat/completions',
    );
  });

  it('throws NoSuchModelError for embedding and image models', () => {
    const provider = createNebul();
    expect(() => provider.embeddingModel('model')).toThrow(/embeddingModel/);
    expect(() => provider.imageModel('model')).toThrow(/imageModel/);
  });
});
