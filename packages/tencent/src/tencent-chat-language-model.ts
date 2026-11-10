import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import type { TencentChatModelId } from './tencent-chat-language-model-options';

type TencentChatConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

/**
 * TokenHub chat completions over the OpenAI-compatible protocol.
 */
export class TencentChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  constructor(modelId: TencentChatModelId, config: TencentChatConfig) {
    super(modelId, {
      provider: config.provider,
      url: ({ path }) => `${config.baseURL}${path}`,
      headers: config.headers,
      fetch: config.fetch,
      includeUsage: true,
    });
  }
}
