/**
 * Fish Audio TTS model IDs, sent via the `model` HTTP header.
 *
 * Note that the TTS-live WebSocket endpoint supports only `s1` and `s2-pro`,
 * while the HTTP endpoints additionally support `s2.1-pro` and
 * `s2.1-pro-free`.
 *
 * https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
 */
export type FishAudioSpeechModelId =
  | 's1'
  | 's2-pro'
  | 's2.1-pro'
  | 's2.1-pro-free'
  | (string & {});

/**
 * A Fish Audio voice model ID (`reference_id`), either from the Fish Audio
 * voice library or one of your own uploaded models.
 */
export type FishAudioSpeechVoiceId = string;
