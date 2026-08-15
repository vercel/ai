export type {
  XaiLanguageModelChatOptions as SpaceXAILanguageModelChatOptions,
  /** @deprecated Use `SpaceXAILanguageModelChatOptions` instead. */
  XaiLanguageModelChatOptions,
  /** @deprecated Use `SpaceXAILanguageModelChatOptions` instead. */
  XaiLanguageModelChatOptions as XaiProviderOptions,
} from './xai-chat-language-model-options';
export type {
  XaiErrorData as SpaceXAIErrorData,
  /** @deprecated Use `SpaceXAIErrorData` instead. */
  XaiErrorData,
} from './xai-error';
export type {
  XaiFilePartProviderOptions as SpaceXAIFilePartProviderOptions,
  /** @deprecated Use `SpaceXAIFilePartProviderOptions` instead. */
  XaiFilePartProviderOptions,
} from './xai-file-part-options';
export type {
  XaiLanguageModelResponsesOptions as SpaceXAILanguageModelResponsesOptions,
  /** @deprecated Use `SpaceXAILanguageModelResponsesOptions` instead. */
  XaiLanguageModelResponsesOptions,
  /** @deprecated Use `SpaceXAILanguageModelResponsesOptions` instead. */
  XaiLanguageModelResponsesOptions as XaiResponsesProviderOptions,
} from './responses/xai-responses-language-model-options';
export type {
  XaiImageModelOptions as SpaceXAIImageModelOptions,
  /** @deprecated Use `SpaceXAIImageModelOptions` instead. */
  XaiImageModelOptions,
  /** @deprecated Use `SpaceXAIImageModelOptions` instead. */
  XaiImageModelOptions as XaiImageProviderOptions,
} from './xai-image-model-options';
export type {
  XaiVideoModelId as SpaceXAIVideoModelId,
  /** @deprecated Use `SpaceXAIVideoModelId` instead. */
  XaiVideoModelId,
} from './xai-video-settings';
export type {
  XaiVideoModelOptions as SpaceXAIVideoModelOptions,
  /** @deprecated Use `SpaceXAIVideoModelOptions` instead. */
  XaiVideoModelOptions,
  /** @deprecated Use `SpaceXAIVideoModelOptions` instead. */
  XaiVideoModelOptions as XaiVideoProviderOptions,
} from './xai-video-model-options';
export type {
  XaiSpeechModelOptions as SpaceXAISpeechModelOptions,
  /** @deprecated Use `SpaceXAISpeechModelOptions` instead. */
  XaiSpeechModelOptions,
} from './xai-speech-model-options';
export type {
  XaiTranscriptionModelOptions as SpaceXAITranscriptionModelOptions,
  /** @deprecated Use `SpaceXAITranscriptionModelOptions` instead. */
  XaiTranscriptionModelOptions,
} from './xai-transcription-model-options';
export type {
  XaiFilesOptions as SpaceXAIFilesOptions,
  /** @deprecated Use `SpaceXAIFilesOptions` instead. */
  XaiFilesOptions,
} from './files/xai-files-options';
export {
  createSpaceXAI,
  spacexai,
  /** @deprecated Use `createSpaceXAI` instead. */
  createXai,
  /** @deprecated Use `spacexai` instead. */
  xai,
} from './xai-provider';
export type {
  SpaceXAIProvider,
  SpaceXAIProviderSettings,
  /** @deprecated Use `SpaceXAIProvider` instead. */
  XaiProvider,
  /** @deprecated Use `SpaceXAIProviderSettings` instead. */
  XaiProviderSettings,
} from './xai-provider';
export { XaiRealtimeModel as Experimental_SpaceXAIRealtimeModel } from './realtime/xai-realtime-model';
export type { XaiRealtimeModelConfig as Experimental_SpaceXAIRealtimeModelConfig } from './realtime/xai-realtime-model';
/** @deprecated Use `Experimental_SpaceXAIRealtimeModel` instead. */
export { XaiRealtimeModel as Experimental_XaiRealtimeModel } from './realtime/xai-realtime-model';
/** @deprecated Use `Experimental_SpaceXAIRealtimeModelConfig` instead. */
export type { XaiRealtimeModelConfig as Experimental_XaiRealtimeModelConfig } from './realtime/xai-realtime-model';
export {
  codeExecution,
  imageGeneration,
  mcpServer,
  viewImage,
  viewXVideo,
  webSearch,
  xSearch,
  spacexaiTools,
  /** @deprecated Use `spacexaiTools` instead. */
  xaiTools,
} from './tool';
export { VERSION } from './version';
