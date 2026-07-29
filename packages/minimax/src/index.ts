export { createMiniMax, minimax } from './minimax-provider';
export type {
  MiniMaxProvider,
  MiniMaxProviderSettings,
  MiniMaxErrorData,
} from './minimax-provider';
export type {
  MiniMaxChatModelId,
  MiniMaxLanguageModelOptions,
  /** @deprecated Use `MiniMaxLanguageModelOptions` instead. */
  MiniMaxLanguageModelOptions as MiniMaxProviderOptions,
} from './minimax-chat-options';
export { VERSION } from './version';
