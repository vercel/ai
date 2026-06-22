export { createSiliconFlow, siliconflow } from './siliconflow-provider';
export type {
  SiliconFlowProvider,
  SiliconFlowProviderSettings,
} from './siliconflow-provider';
export { VERSION } from './version';
export type {
  SiliconFlowLanguageModelChatOptions,
  /** @deprecated Use `SiliconFlowLanguageModelChatOptions` instead. */
  SiliconFlowLanguageModelChatOptions as SiliconFlowChatOptions,
} from './chat/siliconflow-chat-options';
export type { SiliconFlowErrorData } from './chat/siliconflow-chat-types';
