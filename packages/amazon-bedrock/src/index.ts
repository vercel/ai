export type { AnthropicProviderOptions } from '@ai-sdk/anthropic';

export type { AmazonBedrockEmbeddingModelOptions } from './amazon-bedrock-embedding-options';
export type {
  AmazonBedrockLanguageModelOptions,
  /** @deprecated Use `AmazonBedrockLanguageModelOptions` instead. */
  AmazonBedrockLanguageModelOptions as BedrockProviderOptions,
} from './amazon-bedrock-chat-options';
export {
  amazonBedrock,
  /** @deprecated Use `amazonBedrock` instead. */
  amazonBedrock as bedrock,
  createAmazonBedrock,
} from './amazon-bedrock-provider';
export type {
  AmazonBedrockProvider,
  AmazonBedrockProviderSettings,
} from './amazon-bedrock-provider';
export type {
  AmazonBedrockRerankingModelOptions,
  /** @deprecated Use `AmazonBedrockRerankingModelOptions` instead. */
  AmazonBedrockRerankingModelOptions as BedrockRerankingOptions,
} from './reranking/amazon-bedrock-reranking-options';
export { VERSION } from './version';
