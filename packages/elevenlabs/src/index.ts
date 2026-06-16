export {
  createElevenLabs,
  elevenLabs,
  /** @deprecated Use `elevenLabs` instead. */
  elevenLabs as elevenlabs,
} from './elevenlabs-provider';
export type {
  ElevenLabsProvider,
  ElevenLabsProviderSettings,
} from './elevenlabs-provider';
export { ElevenLabsRealtimeModel as Experimental_ElevenLabsRealtimeModel } from './realtime/elevenlabs-realtime-model';
export type { ElevenLabsRealtimeModelConfig as Experimental_ElevenLabsRealtimeModelConfig } from './realtime/elevenlabs-realtime-model';
export type {
  ElevenLabsSpeechModelId,
  ElevenLabsSpeechVoiceId,
} from './elevenlabs-speech-options';
export type { ElevenLabsSpeechModelOptions } from './elevenlabs-speech-model-options';
export type { ElevenLabsTranscriptionModelOptions } from './elevenlabs-transcription-model-options';
export type {
  ElevenLabsRealtimeModelId,
  ElevenLabsRealtimeModelOptions,
} from './realtime/elevenlabs-realtime-model-options';
export { VERSION } from './version';
