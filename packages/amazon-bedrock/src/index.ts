export type { AnthropicProviderOptions } from '@ai-sdk/anthropic';

<<<<<<< HEAD
export type { AmazonBedrockEmbeddingModelOptions } from './bedrock-embedding-options';
=======
export type {
  AmazonBedrockEmbeddingModelOptions,
  AmazonBedrockEmbeddingModelSettings,
} from './amazon-bedrock-embedding-model-options';
export type { AmazonBedrockImageModelOptions } from './amazon-bedrock-image-model-options';
>>>>>>> 5d2229e7f0 (feat(amazon-bedrock): add model family setting for embeddings to support ARN (#19854))
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
