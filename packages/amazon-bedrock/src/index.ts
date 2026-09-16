export type { AnthropicProviderOptions } from '@ai-sdk/anthropic';

export type {
  AmazonBedrockEmbeddingModelOptions,
  AmazonBedrockEmbeddingModelSettings,
} from './bedrock-embedding-options';
export type {
<<<<<<< HEAD
  AmazonBedrockLanguageModelOptions,
  /** @deprecated Use `AmazonBedrockLanguageModelOptions` instead. */
  AmazonBedrockLanguageModelOptions as BedrockProviderOptions,
} from './bedrock-chat-options';
export { bedrock, createAmazonBedrock } from './bedrock-provider';
=======
  AmazonBedrockChatModelSettings,
  AmazonBedrockLanguageModelChatOptions,
  /** @deprecated Use `AmazonBedrockLanguageModelChatOptions` instead. */
  AmazonBedrockLanguageModelChatOptions as AmazonBedrockLanguageModelOptions,
  /** @deprecated Use `AmazonBedrockLanguageModelChatOptions` instead. */
  AmazonBedrockLanguageModelChatOptions as BedrockProviderOptions,
} from './amazon-bedrock-chat-language-model-options';
export {
  amazonBedrock,
  /** @deprecated Use `amazonBedrock` instead. */
  amazonBedrock as bedrock,
  createAmazonBedrock,
} from './amazon-bedrock-provider';
>>>>>>> d82eac280e (fix: use native structured output for Anthropic chat models behind application inference profiles (#20792))
export type {
  AmazonBedrockProvider,
  AmazonBedrockProviderSettings,
} from './bedrock-provider';
export type {
  AmazonBedrockRerankingModelOptions,
  /** @deprecated Use `AmazonBedrockRerankingModelOptions` instead. */
  AmazonBedrockRerankingModelOptions as BedrockRerankingOptions,
} from './reranking/bedrock-reranking-options';
export { VERSION } from './version';
