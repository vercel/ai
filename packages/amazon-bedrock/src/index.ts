export type { AnthropicProviderOptions } from '@ai-sdk/anthropic';

export type { BedrockProviderOptions } from './bedrock-chat-options';
export { bedrock, createAmazonBedrock } from './bedrock-provider';
export type {
  AmazonBedrockProvider,
  AmazonBedrockProviderSettings,
} from './bedrock-provider';
export type { BedrockRerankingOptions } from './reranking/bedrock-reranking-options';
export { VERSION } from './version';
