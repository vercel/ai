import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInterfaze } from './interfaze-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { InterfazeChatLanguageModel } from './interfaze-chat-language-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  };
});

describe('InterfazeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createInterfaze', () => {
    it('should create an InterfazeProvider instance with default options', () => {
      const provider = createInterfaze();
      const model = provider('interfaze-beta') as any;
      model.config.headers(); // apiKey is only resolved lazily, on request

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'INTERFAZE_API_KEY',
        description: 'Interfaze API key',
      });
    });

    it('should create an InterfazeProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createInterfaze(options);
      const model = provider('interfaze-beta') as any;
      model.config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'INTERFAZE_API_KEY',
        description: 'Interfaze API key',
      });
    });

    it('should pass a versioned user-agent header', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createInterfaze({ fetch: fetchMock });
      const model = provider('interfaze-beta') as InstanceType<
        typeof InterfazeChatLanguageModel
      >;
      const headers = (model as any).config.headers();

      await fetchMock('https://api.interfaze.ai/v1/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/interfaze/0.0.0-test',
      );
    });

    it('should default the base URL to the Interfaze API', () => {
      const provider = createInterfaze({ fetch: vi.fn() });
      const model = provider('interfaze-beta') as InstanceType<
        typeof InterfazeChatLanguageModel
      >;
      expect((model as any).config.url({ path: '/chat/completions' })).toBe(
        'https://api.interfaze.ai/v1/chat/completions',
      );
    });

    it('should allow overriding the base URL', () => {
      const provider = createInterfaze({
        baseURL: 'https://staging.interfaze.ai/v1/',
        fetch: vi.fn(),
      });
      const model = provider('interfaze-beta') as InstanceType<
        typeof InterfazeChatLanguageModel
      >;
      expect((model as any).config.url({ path: '/chat/completions' })).toBe(
        'https://staging.interfaze.ai/v1/chat/completions',
      );
    });

    it('should return an InterfazeChatLanguageModel when called as a function', () => {
      const provider = createInterfaze();
      expect(provider('interfaze-beta')).toBeInstanceOf(
        InterfazeChatLanguageModel,
      );
    });

    it('should normalize a non-array precontext to a single-element array', () => {
      const provider = createInterfaze();
      const model = provider('interfaze-beta') as any;

      expect(
        model.config.transformRequestBody({
          model: 'interfaze-beta',
          messages: [],
          precontext: { name: 'ocr', result: 'text' },
        }),
      ).toEqual({
        model: 'interfaze-beta',
        messages: [],
        precontext: [{ name: 'ocr', result: 'text' }],
      });
    });

    it('should leave an array precontext untouched', () => {
      const provider = createInterfaze();
      const model = provider('interfaze-beta') as any;

      const args = {
        model: 'interfaze-beta',
        messages: [],
        precontext: [{ name: 'ocr', result: 'text' }],
      };
      expect(model.config.transformRequestBody(args)).toEqual(args);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createInterfaze();
      expect(provider.languageModel('interfaze-beta')).toBeInstanceOf(
        InterfazeChatLanguageModel,
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createInterfaze();
      expect(provider.chat('interfaze-beta')).toBeInstanceOf(
        InterfazeChatLanguageModel,
      );
    });
  });

  describe('embeddingModel', () => {
    it('should throw NoSuchModelError when attempting to create embedding model', () => {
      const provider = createInterfaze();
      expect(() => provider.embeddingModel('any-model')).toThrow(
        'No such embeddingModel: any-model',
      );
    });
  });

  describe('imageModel', () => {
    it('should throw NoSuchModelError when attempting to create an image model', () => {
      const provider = createInterfaze();
      expect(() => provider.imageModel('any-model')).toThrow(
        'No such imageModel: any-model',
      );
    });
  });
});
