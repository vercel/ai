export type OpenAITranscriptionModelId =
  | 'whisper-1'
  | 'gpt-4o-mini-transcribe'
  | 'gpt-4o-transcribe'
  | (string & {});

export type OpenAITranscriptionModelOptions = {
  /**
   * Additional information to include in the transcription response.
   */
  include?: string[];

  /**
   * The language of the input audio in ISO-639-1 format.
   */
  language?: string;

  /**
   * An optional text to guide the model's style or continue a previous audio segment.
   */
  prompt?: string;

  /**
   * The sampling temperature, between 0 and 1.
   * @default 0
   */
  temperature?: number;

  /**
   * The timestamp granularities to populate for this transcription.
   * @default ['segment']
   */
  timestamp_granularities?: Array<'word' | 'segment'>;
};
