export { createElevenLabs, elevenlabs } from './elevenlabs-provider';
export type {
  ElevenLabsProvider,
  ElevenLabsProviderSettings,
} from './elevenlabs-provider';
export type {
  ElevenLabsSpeechModelId,
  ElevenLabsSpeechVoiceId,
} from './elevenlabs-speech-options';
export type { ElevenLabsSpeechModelOptions } from './elevenlabs-speech-model';
export type { ElevenLabsTranscriptionModelOptions } from './elevenlabs-transcription-model';
export {
  ElevenLabsRealtimeModel,
  ElevenLabsRealtimeEventMapper,
  buildElevenLabsSessionConfig,
} from './realtime';
export type { ElevenLabsRealtimeModelConfig } from './realtime';
export { VERSION } from './version';
