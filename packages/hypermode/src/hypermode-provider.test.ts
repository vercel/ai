import { createHypermode } from './hypermode-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { HypermodeChatLanguageModel } from './hypermode-chat-language-model';
import { HypermodeEmbeddingModel } from './hypermode-embedding-model';

// Add type assertions for the mocked classes
const HypermodeChatLanguageModelMock =
  HypermodeChatLanguageModel as unknown as Mock;
const HypermodeEmbeddingModelMock = HypermodeEmbeddingModel as unknown as Mock;

vi.mock('./hypermode-chat-language-model', () => ({
  HypermodeChatLanguageModel: vi.fn(),
}));

vi.mock('./hypermode-embedding-model', () => ({
  HypermodeEmbeddingModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url || 'https://models.hypermode.host/v1'),
}));

describe('HypermodeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createHypermode', () => {
    it('should create a HypermodeProvider instance with default options', () => {
      const provider = createHypermode();
      const model = provider('model-id');

      const constructorCall = HypermodeChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'HYPERMODE_API_KEY',
        description: 'Hypermode API key',
      });
    });

    it('should create a HypermodeProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createHypermode(options);
      provider('model-id');

      const constructorCall = HypermodeChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'HYPERMODE_API_KEY',
        description: 'Hypermode API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createHypermode();
      const modelId = 'foo-model-id';
      const settings = { user: 'foo-user' };

      const model = provider(modelId, settings);
      expect(model).toBeInstanceOf(HypermodeChatLanguageModel);
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createHypermode();
      const modelId = 'hypermode-chat-model';
      const settings = { user: 'foo-user' };

      const model = provider.chat(modelId, settings);

      expect(model).toBeInstanceOf(HypermodeChatLanguageModel);
      expect(HypermodeChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        settings,
        expect.objectContaining({
          provider: 'hypermode.chat',
          url: expect.any(Function),
          headers: expect.any(Function),
        }),
      );
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createHypermode();
      const modelId = 'hypermode-language-model';
      const settings = { user: 'foo-user' };

      const model = provider.languageModel(modelId, settings);

      expect(model).toBeInstanceOf(HypermodeChatLanguageModel);
      expect(HypermodeChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        settings,
        expect.objectContaining({
          provider: 'hypermode.chat',
          url: expect.any(Function),
          headers: expect.any(Function),
        }),
      );
    });
  });

  describe('embedding', () => {
    it('should construct an embedding model with correct configuration', () => {
      const provider = createHypermode();
      const modelId = 'hypermode-embedding-model';
      const settings = { user: 'foo-user' };

      const model = provider.embedding(modelId, settings);

      expect(model).toBeInstanceOf(HypermodeEmbeddingModel);
      expect(HypermodeEmbeddingModelMock).toHaveBeenCalledWith(
        modelId,
        settings,
        expect.objectContaining({
          provider: 'hypermode.embedding',
          url: expect.any(Function),
          headers: expect.any(Function),
        }),
      );
    });
  });

  describe('textEmbeddingModel', () => {
    it('should construct a text embedding model with correct configuration', () => {
      const provider = createHypermode();
      const modelId = 'hypermode-embedding-model';
      const settings = { user: 'foo-user' };

      const model = provider.textEmbeddingModel(modelId, settings);

      expect(model).toBeInstanceOf(HypermodeEmbeddingModel);
      expect(HypermodeEmbeddingModelMock).toHaveBeenCalledWith(
        modelId,
        settings,
        expect.objectContaining({
          provider: 'hypermode.embedding',
          url: expect.any(Function),
          headers: expect.any(Function),
        }),
      );
    });
  });
});
