export type { AnthropicProviderOptions } from '@ai-sdk/anthropic';

export type { AmazonBedrockEmbeddingModelOptions } from './bedrock-embedding-options';
export type {
  AmazonBedrockLanguageModelOptions,
  /** @deprecated Use `AmazonBedrockLanguageModelOptions` instead. */
  AmazonBedrockLanguageModelOptions as BedrockProviderOptions,
} from './bedrock-chat-options';
export { bedrock, createAmazonBedrock } from './bedrock-provider';
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
