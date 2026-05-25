// Wire-level types for the Gradium REST API.
// Mirrors the request/response shapes documented at
// https://gradium.ai/api_docs.html and in the local OpenAPI spec.

/**
 * Audio output formats accepted by `POST /post/speech/tts`.
 *
 * `wav`, `pcm`, `opus` are the canonical formats and the only ones the
 * AI SDK's top-level `outputFormat` maps to today. The remaining values
 * cover telephony (mu-law / a-law / 8 kHz PCM) and explicit sample-rate
 * PCM variants — pass them via `providerOptions.gradium.outputFormat`.
 */
export type GradiumTTSOutputFormat =
  | 'wav'
  | 'pcm'
  | 'opus'
  | 'ulaw_8000'
  | 'mulaw_8000'
  | 'alaw_8000'
  | 'pcm_8000'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'pcm_48000';

export const GRADIUM_TTS_OUTPUT_FORMATS = [
  'wav',
  'pcm',
  'opus',
  'ulaw_8000',
  'mulaw_8000',
  'alaw_8000',
  'pcm_8000',
  'pcm_16000',
  'pcm_22050',
  'pcm_24000',
  'pcm_44100',
  'pcm_48000',
] as const satisfies readonly GradiumTTSOutputFormat[];

/** Audio container types Gradium STT accepts on the wire. */
export type GradiumSTTInputFormat =
  | 'wav'
  | 'pcm'
  | 'opus'
  | 'pcm_8000'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'pcm_48000'
  | 'ulaw_8000'
  | 'mulaw_8000'
  | 'alaw_8000';

export const GRADIUM_STT_INPUT_FORMATS = [
  'wav',
  'pcm',
  'opus',
  'pcm_8000',
  'pcm_16000',
  'pcm_22050',
  'pcm_24000',
  'pcm_44100',
  'pcm_48000',
  'ulaw_8000',
  'mulaw_8000',
  'alaw_8000',
] as const satisfies readonly GradiumSTTInputFormat[];

/** Request body for `POST /post/speech/tts`. */
export interface GradiumTTSRequestBody {
  text: string;
  voice_id: string;
  output_format: GradiumTTSOutputFormat;
  only_audio?: boolean;
  model_name?: string;
  json_config?: string;
}

/** Settings accepted inside `json_config` for `POST /post/speech/tts`. */
export interface GradiumTTSJsonConfig {
  padding_bonus?: number;
  cfg_coef?: number;
  temp?: number;
  rewrite_rules?: string;
  pronunciation_dictionary?: string;
}

/** JSON messages returned by TTS when `only_audio` is false. */
export type GradiumTTSMessage =
  | {
      type: 'audio';
      audio: string;
      stream_id?: number;
    }
  | {
      type: 'text';
      text: string;
      start_s?: number;
      stop_s?: number;
      stream_id?: number;
    }
  | {
      type: 'error';
      message: string;
      code?: number | string;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

/** A single NDJSON line returned by `POST /post/speech/asr`. */
export type GradiumSTTMessage =
  | {
      type: 'text';
      text: string;
      start_s: number;
      stream_id?: number;
    }
  | {
      type: 'end_text';
      stop_s: number;
      stream_id?: number;
    }
  | {
      type: 'error';
      message: string;
      code?: number;
    };
