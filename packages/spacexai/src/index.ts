export type {
  SpaceXAILanguageModelChatOptions,
  /** @deprecated Use `SpaceXAILanguageModelChatOptions` instead. */
  SpaceXAILanguageModelChatOptions as XaiLanguageModelChatOptions,
  /** @deprecated Use `SpaceXAILanguageModelChatOptions` instead. */
  SpaceXAILanguageModelChatOptions as XaiProviderOptions,
} from './spacexai-chat-language-model-options';
export type {
  SpaceXAIErrorData,
  /** @deprecated Use `SpaceXAIErrorData` instead. */
  SpaceXAIErrorData as XaiErrorData,
} from './spacexai-error';
export type {
  SpaceXAIFilePartProviderOptions,
  /** @deprecated Use `SpaceXAIFilePartProviderOptions` instead. */
  SpaceXAIFilePartProviderOptions as XaiFilePartProviderOptions,
} from './spacexai-file-part-options';
export type {
  SpaceXAILanguageModelResponsesOptions,
  /** @deprecated Use `SpaceXAILanguageModelResponsesOptions` instead. */
  SpaceXAILanguageModelResponsesOptions as XaiLanguageModelResponsesOptions,
  /** @deprecated Use `SpaceXAILanguageModelResponsesOptions` instead. */
  SpaceXAILanguageModelResponsesOptions as XaiResponsesProviderOptions,
} from './responses/spacexai-responses-language-model-options';
export type {
  SpaceXAIImageModelOptions,
  /** @deprecated Use `SpaceXAIImageModelOptions` instead. */
  SpaceXAIImageModelOptions as XaiImageModelOptions,
  /** @deprecated Use `SpaceXAIImageModelOptions` instead. */
  SpaceXAIImageModelOptions as XaiImageProviderOptions,
} from './spacexai-image-model-options';
export type {
  SpaceXAIVideoModelId,
  /** @deprecated Use `SpaceXAIVideoModelId` instead. */
  SpaceXAIVideoModelId as XaiVideoModelId,
} from './spacexai-video-settings';
export type {
  SpaceXAIVideoModelOptions,
  /** @deprecated Use `SpaceXAIVideoModelOptions` instead. */
  SpaceXAIVideoModelOptions as XaiVideoModelOptions,
  /** @deprecated Use `SpaceXAIVideoModelOptions` instead. */
  SpaceXAIVideoModelOptions as XaiVideoProviderOptions,
} from './spacexai-video-model-options';
export type {
  SpaceXAISpeechModelOptions,
  /** @deprecated Use `SpaceXAISpeechModelOptions` instead. */
  SpaceXAISpeechModelOptions as XaiSpeechModelOptions,
} from './spacexai-speech-model-options';
export type {
  SpaceXAITranscriptionModelOptions,
  /** @deprecated Use `SpaceXAITranscriptionModelOptions` instead. */
  SpaceXAITranscriptionModelOptions as XaiTranscriptionModelOptions,
} from './spacexai-transcription-model-options';
export type {
  SpaceXAIFilesOptions,
  /** @deprecated Use `SpaceXAIFilesOptions` instead. */
  SpaceXAIFilesOptions as XaiFilesOptions,
} from './files/spacexai-files-options';
export {
  createSpaceXAI,
  spacexai,
  /** @deprecated Use `createSpaceXAI` instead. */
  createXai,
  /** @deprecated Use `spacexai` instead. */
  xai,
} from './spacexai-provider';
export type {
  SpaceXAIProvider,
  SpaceXAIProviderSettings,
  /** @deprecated Use `SpaceXAIProvider` instead. */
  XaiProvider,
  /** @deprecated Use `SpaceXAIProviderSettings` instead. */
  XaiProviderSettings,
} from './spacexai-provider';
export { SpaceXAIRealtimeModel as Experimental_SpaceXAIRealtimeModel } from './realtime/spacexai-realtime-model';
export type { SpaceXAIRealtimeModelConfig as Experimental_SpaceXAIRealtimeModelConfig } from './realtime/spacexai-realtime-model';
/** @deprecated Use `Experimental_SpaceXAIRealtimeModel` instead. */
export { SpaceXAIRealtimeModel as Experimental_XaiRealtimeModel } from './realtime/spacexai-realtime-model';
/** @deprecated Use `Experimental_SpaceXAIRealtimeModelConfig` instead. */
export type { SpaceXAIRealtimeModelConfig as Experimental_XaiRealtimeModelConfig } from './realtime/spacexai-realtime-model';
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
