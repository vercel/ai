import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { OpenAICompatibleChatConfig } from '@ai-sdk/openai-compatible/internal';
import {
  type FetchFunction,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { BaiduChatModelId } from './baidu-chat-options';
import { convertBaiduChatUsage } from './convert-baidu-chat-usage';

type BaiduChatConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  includeUsage?: boolean;
};

export class BaiduChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  static [WORKFLOW_SERIALIZE](model: BaiduChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: BaiduChatModelId;
    config: BaiduChatConfig;
  }) {
    return new BaiduChatLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: BaiduChatModelId, config: BaiduChatConfig) {
    super(modelId, {
      provider: config.provider,
      url: ({ path }) => `${config.baseURL}${path}`,
      headers: config.headers,
      fetch: config.fetch,
      includeUsage: config.includeUsage,
      supportedUrls: () => ({
        'image/*': [/^https?:\/\/.*$/, /^data:image\/.+$/],
      }),
      convertUsage: convertBaiduChatUsage,
    } satisfies OpenAICompatibleChatConfig);
  }
}
