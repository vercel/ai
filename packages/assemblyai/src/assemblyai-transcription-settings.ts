import type { AssemblyAIModelIds } from './assemblyai-model-catalog';
/**
 * Legacy AssemblyAI speech model, sent via the deprecated singular
 * `speech_model` request parameter.
 *
 * @deprecated Use `universal-3-5-pro` instead.
 * @see https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model
 */
export type AssemblyAIDeprecatedTranscriptionModelId = 'best';

export type AssemblyAITranscriptionModelId =
  | AssemblyAIModelIds['transcription']
  | (string & {});
