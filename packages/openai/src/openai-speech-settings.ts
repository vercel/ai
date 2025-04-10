export type OpenAISpeechModelId =
  | 'tts-1'
  | 'tts-1-hd'
  | 'gpt-4o-mini-tts'
  | (string & {});

export type OpenAISpeechModelOptions = {
  /**
   * The voice to use when generating the audio.
   * Supported voices are alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, and verse.
   * @default 'alloy'
   */
  voice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'verse';

  /**
   * The speed of the generated audio.
   * Select a value from 0.25 to 4.0.
   * @default 1.0
   */
  speed?: number;

  /**
   * The format of the generated audio.
   * @default 'mp3'
   */
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

  /**
   * Control the voice of your generated audio with additional instructions.
   * Does not work with tts-1 or tts-1-hd.
   */
  instructions?: string;
};
