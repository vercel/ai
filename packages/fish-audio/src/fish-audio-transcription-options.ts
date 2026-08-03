/**
 * Fish Audio transcription model ID.
 *
 * `POST /v1/asr` exposes no model selector, so `default` is a synthetic ID
 * that stands in for the single implicit ASR model. It is accepted for
 * symmetry with other providers and is not sent to the API.
 *
 * https://docs.fish.audio/api-reference/endpoint/openapi-v1/speech-to-text
 */
export type FishAudioTranscriptionModelId = 'default' | (string & {});
