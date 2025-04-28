export type SarvamTranscriptionAPITypes = {
  /**
   * Specifies the model to use for speech-to-text conversion.
   * @default 'saarika:v2'
   */
  model?: 'saarika:v1' | 'saarika:v2' | 'saarika:flash';

  /**
   * Specifies the language of the input audio.
   * Required for the 'saarika:v1' model. Optional for 'saarika:v2'.
   * 'unknown' lets the API detect the language automatically (not supported by 'saarika:v1').
   */
  language_code?:
    | 'unknown'
    | 'hi-IN'
    | 'bn-IN'
    | 'kn-IN'
    | 'ml-IN'
    | 'mr-IN'
    | 'od-IN'
    | 'pa-IN'
    | 'ta-IN'
    | 'te-IN'
    | 'en-IN'
    | 'gu-IN';

  /**
   * Enables timestamps in the response.
   * If set to true, the response will include timestamps in the transcript.
   * @default false
   */
  with_timestamps?: boolean;

  /**
   * Enables speaker diarization, which identifies and separates different speakers in the audio.
   * When set to true, the API will provide speaker-specific segments in the response.
   * Note: This parameter is currently in Beta mode.
   * @default false
   */
  with_diarization?: boolean;

  /**
   * Number of speakers to be detected in the audio.
   * This is used when with_diarization is set to true.
   * Can be null.
   */
  num_speakers?: number | null;
};
