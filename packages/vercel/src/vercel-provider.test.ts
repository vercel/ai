import { createVercel } from './vercel-provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
<<<<<<< HEAD
import { LanguageModelV1 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Add type assertion for the mocked class
=======
import { LanguageModelV2 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
  OpenAICompatibleCompletionLanguageModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
}));

vi.mock('./vercel-image-model', () => ({
  VercelImageModel: vi.fn(),
}));

describe('VercelProvider', () => {
<<<<<<< HEAD
  let mockLanguageModel: LanguageModelV1;

  beforeEach(() => {
    // Mock implementations of models
    mockLanguageModel = {
      // Add any required methods for LanguageModelV1
    } as LanguageModelV1;
=======
  let mockLanguageModel: LanguageModelV2;

  beforeEach(() => {
    mockLanguageModel = {
      // Add any required methods for LanguageModelV1
    } as LanguageModelV2;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('createVercel', () => {
    it('should create a VercelProvider instance with default options', () => {
      const provider = createVercel();
<<<<<<< HEAD
      const model = provider('model-id');
=======
      provider('model-id');
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

      // Use the mocked version
      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
<<<<<<< HEAD
      const config = constructorCall[2];
=======
      const config = constructorCall[1];
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'VERCEL_API_KEY',
        description: 'Vercel',
      });
    });

    it('should create a VercelProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createVercel(options);
<<<<<<< HEAD
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
=======
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'VERCEL_API_KEY',
        description: 'Vercel',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createVercel();
      const modelId = 'foo-model-id';
<<<<<<< HEAD
      const settings = { user: 'foo-user' };

      const model = provider(modelId, settings);
=======

      const model = provider(modelId);
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

<<<<<<< HEAD
  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createVercel();
      const modelId = 'vercel-chat-model';
      const settings = { user: 'foo-user' };

      const model = provider.chatModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        settings,
        expect.objectContaining({
          provider: 'vercel.chat',
          defaultObjectGenerationMode: 'json',
        }),
      );
    });
=======
  it('should construct a language model with correct configuration', () => {
    const provider = createVercel();
    const modelId = 'vercel-chat-model';

    const model = provider.languageModel(modelId);

    expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
      modelId,
      expect.objectContaining({
        provider: 'vercel.chat',
      }),
    );
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
  });
});
