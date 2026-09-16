<<<<<<< HEAD
export { bedrock, createAmazonBedrock } from './bedrock-provider';
=======
export type { AnthropicProviderOptions } from '@ai-sdk/anthropic';

export type {
  AmazonBedrockEmbeddingModelOptions,
  AmazonBedrockEmbeddingModelSettings,
} from './amazon-bedrock-embedding-model-options';
export type { AmazonBedrockImageModelOptions } from './amazon-bedrock-image-model-options';
export type {
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
export type { BedrockProviderOptions } from './bedrock-chat-options';
export { VERSION } from './version';
