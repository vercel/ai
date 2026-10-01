/**
 * Fish Audio TTS model IDs, sent via the `model` HTTP header.
 *
 * `s2.1-pro` is the model Fish Audio recommends by default. `s2.1-pro-free` is
 * a free developer tier with no time-to-first-audio or data-processing
 * guarantees, so prefer `s2.1-pro` for production use.
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
