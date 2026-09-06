import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createGmicloud } from './gmicloud-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { gmicloudErrorStructure } from './gmicloud-error';

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

describe('createGmicloud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the GMI Cloud endpoint and GMI_CLOUD_APIKEY', () => {
    const provider = createGmicloud();
    provider('deepseek-ai/DeepSeek-V4-Flash-0731');

    const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    const headers = config.headers!();

    expect(config.provider).toBe('gmicloud.chat');
    expect(config.url({ path: '/chat/completions' })).toBe(
      'https://api.gmi-serving.com/v1/chat/completions',
    );
    expect(loadApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ environmentVariableName: 'GMI_CLOUD_APIKEY' }),
    );
    expect(headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer mock-api-key',
        'user-agent': 'ai-sdk/gmicloud/0.0.0-test',
      }),
    );
  });

  it('attaches the gmicloud error structure and includeUsage', () => {
    const provider = createGmicloud();
    provider.chat('deepseek-ai/DeepSeek-V4-Flash-0731');

    const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    expect(config.errorStructure).toBe(gmicloudErrorStructure);
    expect(config.includeUsage).toBe(true);
  });

  it('respects a custom baseURL', () => {
    const provider = createGmicloud({ baseURL: 'https://example.com/gmi' });
    provider('model');

    const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    expect(config.url({ path: '/chat/completions' })).toBe(
      'https://example.com/gmi/chat/completions',
    );
  });

  it('throws NoSuchModelError for embedding and image models', () => {
    const provider = createGmicloud();
    expect(() => provider.embeddingModel('model')).toThrow(/embeddingModel/);
    expect(() => provider.imageModel('model')).toThrow(/imageModel/);
  });
});
