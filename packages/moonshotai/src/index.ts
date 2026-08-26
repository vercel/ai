export { createMoonshotAI, moonshotai } from './moonshotai-provider';
export type {
  MoonshotAIProvider,
  MoonshotAIProviderSettings,
} from './moonshotai-provider';
export type {
  MoonshotAIAssistantMessageProviderOptions,
  MoonshotAIChatModelId,
  MoonshotAILanguageModelOptions,
  MoonshotAIMessageProviderOptions,
  /** @deprecated Use `MoonshotAILanguageModelOptions` instead. */
  MoonshotAILanguageModelOptions as MoonshotAIProviderOptions,
} from './moonshotai-chat-options';
export { VERSION } from './version';
