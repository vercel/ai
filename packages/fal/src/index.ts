export type { FalProvider, FalProviderSettings } from './fal-provider';
export { createFal, fal } from './fal-provider';
export type {
  FalImageModelOptions,
  /** @deprecated Use `FalImageModelOptions` instead. */
  FalImageModelOptions as FalImageProviderOptions,
} from './fal-image-options';
export type { FalSpeechModelOptions } from './fal-speech-model';
export type { FalTranscriptionModelOptions } from './fal-transcription-model';
export type {
  FalVideoModelOptions,
  /** @deprecated Use `FalVideoModelOptions` instead. */
  FalVideoModelOptions as FalVideoProviderOptions,
} from './fal-video-model';
export type { FalVideoModelId } from './fal-video-settings';
export { VERSION } from './version';
