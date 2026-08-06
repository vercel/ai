export { createMiniMax, minimax } from './minimax-provider';
export type {
  MiniMaxProvider,
  MiniMaxProviderSettings,
} from './minimax-provider';
export type {
  MiniMaxChatModelId,
  MiniMaxLanguageModelOptions,
  /** @deprecated Use `MiniMaxLanguageModelOptions` instead. */
  MiniMaxLanguageModelOptions as MiniMaxProviderOptions,
} from './minimax-chat-options';
export type { MiniMaxImageModelId } from './minimax-image-settings';
export type { MiniMaxImageModelOptions } from './minimax-image-model-options';
export type { MiniMaxVideoModelId } from './minimax-video-settings';
export type { MiniMaxVideoModelOptions } from './minimax-video-model-options';
export { VERSION } from './version';
