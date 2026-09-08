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

// Gating is deliberately narrow so newly released AssemblyAI models work
// without an SDK update; the API reports an error for ids it does not serve.

const prerecordedOnlyModelIds: ReadonlySet<string> = new Set<string>([
  'universal-2',
  'universal-3-pro',
  'best',
]);

/**
 * Whether a model id belongs to the Universal Streaming family
 * (`universal-streaming-english`, `universal-streaming-multilingual`), which
 * is served only by the streaming API. Matched structurally by prefix so the
 * check does not have to be updated for new variants.
 */
export function isAssemblyAIUniversalStreamingModelId(
  modelId: string,
): boolean {
  return modelId.startsWith('universal-streaming-');
}

/**
 * Whether a model id is served only by the streaming API. `universal-3-6-pro`
 * is streaming-only today but is intentionally not gated here, so it keeps
 * working with `transcribe` as soon as AssemblyAI serves it there.
 */
export function isAssemblyAIStreamingOnlyModelId(modelId: string): boolean {
  return isAssemblyAIUniversalStreamingModelId(modelId);
}

/**
 * Whether a known model id is served only by the pre-recorded API.
 */
export function isAssemblyAIPrerecordedOnlyModelId(modelId: string): boolean {
  return prerecordedOnlyModelIds.has(modelId);
}

/**
 * Whether a model id is a Universal-3.x Pro model (`universal-3-pro`,
 * `universal-3-5-pro`, `universal-3-6-pro`, ...), which use punctuation-based
 * turn detection and support prompting and conversational context.
 */
export function isAssemblyAIUniversalProModelId(modelId: string): boolean {
  return /^universal-3(-\d+)?-pro$/.test(modelId);
}
