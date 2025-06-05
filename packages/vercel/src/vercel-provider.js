import { NoSuchModelError, } from '@ai-sdk/provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { loadApiKey, withoutTrailingSlash, } from '@ai-sdk/provider-utils';
export function createVercel(options = {}) {
    var _a;
    const baseURL = withoutTrailingSlash((_a = options.baseURL) !== null && _a !== void 0 ? _a : 'https://api.v0.dev/v1');
    const getHeaders = () => ({
        Authorization: `Bearer ${loadApiKey({
            apiKey: options.apiKey,
            environmentVariableName: 'VERCEL_API_KEY',
            description: 'Vercel',
        })}`,
        ...options.headers,
    });
    const getCommonModelConfig = (modelType) => ({
        provider: `vercel.${modelType}`,
        url: ({ path }) => `${baseURL}${path}`,
        headers: getHeaders,
        fetch: options.fetch,
    });
    const createChatModel = (modelId, settings = {}) => {
        return new OpenAICompatibleChatLanguageModel(modelId, {
            ...getCommonModelConfig('chat'),
            ...settings,
        });
    };
    const provider = (modelId, settings) => createChatModel(modelId, settings);
    provider.languageModel = createChatModel;
    provider.chatModel = createChatModel;
    provider.textEmbeddingModel = (modelId) => {
        throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
    };
    provider.imageModel = (modelId) => {
        throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    };
    return provider;
}
export const vercel = createVercel();
