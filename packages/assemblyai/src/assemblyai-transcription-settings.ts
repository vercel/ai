/**
 * Legacy AssemblyAI speech model, sent via the deprecated singular
 * `speech_model` request parameter.
 *
 * @deprecated Use `universal-3-5-pro` instead.
 * @see https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model
 */
export type AssemblyAIDeprecatedTranscriptionModelId = 'best';

/**
 * Models available for pre-recorded transcription via `transcribe`.
 *
 * @see https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model
 */
export type AssemblyAIPrerecordedTranscriptionModelId =
  | 'universal-2'
  | 'universal-3-pro'
  | 'universal-3-5-pro'
  | AssemblyAIDeprecatedTranscriptionModelId;

/**
 * Models available for streaming transcription via
 * `experimental_streamTranscribe` (AssemblyAI Streaming v3 API).
 *
 * @see https://www.assemblyai.com/docs/streaming/select-the-speech-model
 */
export type AssemblyAIStreamingTranscriptionModelId =
  | 'universal-3-5-pro'
  | 'universal-3-6-pro'
  | 'universal-streaming-english'
  | 'universal-streaming-multilingual';

export type AssemblyAITranscriptionModelId =
  | AssemblyAIPrerecordedTranscriptionModelId
  | AssemblyAIStreamingTranscriptionModelId
  | (string & {});

// Only known ids are gated below. Unknown ids are passed through so newly
// released AssemblyAI models work without an SDK update; the API reports an
// error for ids it does not serve.

const streamingOnlyModelIds: ReadonlySet<string> = new Set<string>([
  'universal-3-6-pro',
  'universal-streaming-english',
  'universal-streaming-multilingual',
]);

const prerecordedOnlyModelIds: ReadonlySet<string> = new Set<string>([
  'universal-2',
  'universal-3-pro',
  'best',
]);

/**
 * Whether a known model id is served only by the streaming API.
 */
export function isAssemblyAIStreamingOnlyModelId(modelId: string): boolean {
  return streamingOnlyModelIds.has(modelId);
}

/**
 * Whether a known model id is served only by the pre-recorded API.
 */
export function isAssemblyAIPrerecordedOnlyModelId(modelId: string): boolean {
  return prerecordedOnlyModelIds.has(modelId);
}
