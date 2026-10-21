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
export type {
  ElevenLabsSpeechModelId,
  ElevenLabsSpeechVoiceId,
} from './elevenlabs-speech-options';
export type { ElevenLabsSpeechModelOptions } from './elevenlabs-speech-model-options';
export {
  ElevenLabsDialogueMarkerParser,
  type ElevenLabsDialogueSegment,
} from './elevenlabs-dialogue-markers';
export type { ElevenLabsTranscriptionModelOptions } from './elevenlabs-transcription-model-options';
export { VERSION } from './version';
