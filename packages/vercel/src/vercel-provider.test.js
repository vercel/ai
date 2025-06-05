import { createVercel } from './vercel-provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Add type assertion for the mocked class
const OpenAICompatibleChatLanguageModelMock = OpenAICompatibleChatLanguageModel;
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
    let mockLanguageModel;
    beforeEach(() => {
        // Mock implementations of models
        mockLanguageModel = {
        // Add any required methods for LanguageModelV2
        };
        // Reset mocks
        vi.clearAllMocks();
    });
    describe('createVercel', () => {
        it('should create a VercelProvider instance with default options', () => {
            const provider = createVercel();
            const model = provider('model-id');
            // Use the mocked version - now constructor takes 2 parameters
            const constructorCall = OpenAICompatibleChatLanguageModelMock.mock.calls[0];
            const config = constructorCall[1];
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
            const model = provider('model-id');
            const constructorCall = OpenAICompatibleChatLanguageModelMock.mock.calls[0];
            const config = constructorCall[1];
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
            const model = provider(modelId);
            expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
        });
    });
    describe('languageModel', () => {
        it('should construct a language model with correct configuration', () => {
            const provider = createVercel();
            const modelId = 'vercel-chat-model';
            const model = provider.languageModel(modelId);
            expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
            expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(modelId, expect.objectContaining({
                provider: 'vercel.chat',
            }));
        });
    });
});
