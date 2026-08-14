/**
 * Fish Audio transcription model ID.
 *
 * `POST /v1/asr` currently exposes no model selector and serves a single
 * model, so `transcribe-1` is a routing label rather than a wire value: it is
 * not sent to the API. Fish Audio expects to add more ASR models and to select
 * them with the `model` HTTP header, matching `/v1/tts`.
 *
 * https://docs.fish.audio/api-reference/endpoint/openapi-v1/speech-to-text
 */
export type FishAudioTranscriptionModelId = 'transcribe-1' | (string & {});
