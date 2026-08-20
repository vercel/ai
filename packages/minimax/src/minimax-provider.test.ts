import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { NoSuchModelError } from '@ai-sdk/provider';
import { AnthropicLanguageModel } from '@ai-sdk/anthropic/internal';
import { createMiniMax } from './minimax-provider';
import { MiniMaxVideoModel } from './minimax-video-model';

const AnthropicLanguageModelMock = AnthropicLanguageModel as unknown as Mock;
const MiniMaxVideoModelMock = MiniMaxVideoModel as unknown as Mock;

vi.mock('@ai-sdk/anthropic/internal', () => {
  const mockConstructor = vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    config: any,
  ) {
    this.provider = config.provider;
    this.modelId = modelId;
    this.config = config;
  });
  return {
    AnthropicLanguageModel: mockConstructor,
  };
});

vi.mock('./minimax-video-model', () => {
  const mockConstructor = vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    config: any,
  ) {
    this.provider = config.provider;
    this.modelId = modelId;
    this.config = config;
  });
  return {
    MiniMaxVideoModel: mockConstructor,
  };
});

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    withoutTrailingSlash: vi.fn(url => url),
  };
});

describe('MiniMaxProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMiniMax', () => {
    it('should create a MiniMaxProvider instance with default options', () => {
      const provider = createMiniMax();
      provider('minimax-m3');

      const constructorCall = AnthropicLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'MINIMAX_API_KEY',
        description: 'MiniMax API key',
      });
    });

    it('should create a MiniMaxProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url/anthropic/v1',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createMiniMax(options);
      provider('minimax-m3');

      const constructorCall = AnthropicLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'MINIMAX_API_KEY',
        description: 'MiniMax API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createMiniMax();
      const model = provider('minimax-m3');
      expect(model).toBeInstanceOf(AnthropicLanguageModel);
    });

    it('should construct the model with the Anthropic-compatible config', () => {
      const provider = createMiniMax();
      provider('minimax-m3');

      const constructorCall = AnthropicLanguageModelMock.mock.calls[0];
      const modelId = constructorCall[0];
      const config = constructorCall[1];

      expect(modelId).toBe('minimax-m3');
      // provider prefix `minimax` is the provider-options namespace
      expect(config.provider).toBe('minimax.messages');
      expect(config.baseURL).toBe('https://api.minimax.io/anthropic/v1');

      const headers = config.headers();
      expect(headers['x-api-key']).toBe('mock-api-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });
  });

  describe('languageModel', () => {
    it('should construct a language model', () => {
      const provider = createMiniMax();
      const model = provider.languageModel('minimax-m2.5');
      expect(model).toBeInstanceOf(AnthropicLanguageModel);
    });
  });

  describe('chat', () => {
    it('should construct a chat model', () => {
      const provider = createMiniMax();
      const model = provider.chat('minimax-m2.1');
      expect(model).toBeInstanceOf(AnthropicLanguageModel);
    });
  });

  describe('video', () => {
    it('should construct a video model with the video provider id', () => {
      const provider = createMiniMax();
      const model = provider.video('MiniMax-H3');

      expect(model).toBeInstanceOf(MiniMaxVideoModel);

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('MiniMax-H3');
      expect(constructorCall[1].provider).toBe('minimax.video');
    });

    it('should use the default video base URL, which has no version suffix', () => {
      const provider = createMiniMax();
      provider.video('MiniMax-H3');

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      expect(constructorCall[1].baseURL).toBe('https://api.minimax.io');
    });

    it('should use a custom videoBaseURL', () => {
      const provider = createMiniMax({
        videoBaseURL: 'https://api.minimaxi.com',
      });
      provider.video('MiniMax-H3');

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      expect(constructorCall[1].baseURL).toBe('https://api.minimaxi.com');
    });

    it('should not derive the video base URL from the chat baseURL', () => {
      const provider = createMiniMax({
        baseURL: 'https://custom.url/anthropic/v1',
      });
      provider.video('MiniMax-H3');

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      expect(constructorCall[1].baseURL).toBe('https://api.minimax.io');
    });

    it('should send a bearer token rather than the Anthropic x-api-key header', () => {
      const provider = createMiniMax({ apiKey: 'test-key' });
      provider.video('MiniMax-H3');

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      const headers = constructorCall[1].headers();

      expect(headers).toMatchObject({
        authorization: 'Bearer mock-api-key',
        'user-agent': expect.stringMatching(/^ai-sdk\/minimax\//),
      });
      expect(headers).not.toHaveProperty('x-api-key');
      expect(headers).not.toHaveProperty('anthropic-version');
      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'test-key',
        environmentVariableName: 'MINIMAX_API_KEY',
        description: 'MiniMax API key',
      });
    });

    it('should merge custom headers into the video headers', () => {
      const provider = createMiniMax({
        headers: { 'Custom-Header': 'value' },
      });
      provider.video('MiniMax-H3');

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      expect(constructorCall[1].headers()).toMatchObject({
        authorization: 'Bearer mock-api-key',
        'custom-header': 'value',
      });
    });

    it('should pass a custom fetch to the video model', () => {
      const customFetch = vi.fn();
      const provider = createMiniMax({ fetch: customFetch });
      provider.video('MiniMax-H3');

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      expect(constructorCall[1].fetch).toBe(customFetch);
    });
  });

  describe('videoModel', () => {
    it('should construct the same video model as video()', () => {
      const provider = createMiniMax();
      const model = provider.videoModel('MiniMax-H3');

      expect(model).toBeInstanceOf(MiniMaxVideoModel);

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('MiniMax-H3');
      expect(constructorCall[1].provider).toBe('minimax.video');
      expect(constructorCall[1].baseURL).toBe('https://api.minimax.io');
    });

    it('should use the same custom videoBaseURL as video()', () => {
      const provider = createMiniMax({
        videoBaseURL: 'https://custom-video.example.com',
      });
      provider.videoModel('MiniMax-H3');

      const constructorCall = MiniMaxVideoModelMock.mock.calls[0];
      expect(constructorCall[1].baseURL).toBe(
        'https://custom-video.example.com',
      );
    });
  });

  describe('unsupported model types', () => {
    it('should throw NoSuchModelError for embeddingModel', () => {
      const provider = createMiniMax();
      expect(() => provider.embeddingModel('foo')).toThrow(NoSuchModelError);
    });

    it('should throw NoSuchModelError for textEmbeddingModel', () => {
      const provider = createMiniMax();
      expect(() => provider.textEmbeddingModel('foo')).toThrow(
        NoSuchModelError,
      );
    });

    it('should throw NoSuchModelError for imageModel', () => {
      const provider = createMiniMax();
      expect(() => provider.imageModel('foo')).toThrow(NoSuchModelError);
    });
  });
});
