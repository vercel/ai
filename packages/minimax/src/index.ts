export { createMiniMax, minimax } from './minimax-provider';
export type {
  MiniMaxProvider,
  MiniMaxProviderSettings,
} from './minimax-provider';
export type {
  MiniMaxChatModelId,
  MiniMaxCacheControlOptions,
  MiniMaxLanguageModelOptions,
  /** @deprecated Use `MiniMaxLanguageModelOptions` instead. */
  MiniMaxLanguageModelOptions as MiniMaxProviderOptions,
} from './minimax-chat-language-model-options';
export type { MiniMaxVideoModelId } from './minimax-video-settings';
export type { MiniMaxVideoModelOptions } from './minimax-video-model-options';
export type {
  MiniMaxImagePartOptions,
  MiniMaxVideoPartOptions,
} from './minimax-media-options';
export { VERSION } from './version';
