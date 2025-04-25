export type AssemblyAITranscriptionAPITypes = {
  /**
   * The URL of the audio or video file to transcribe.
   */
  audio_url: string;

  /**
   * The point in time, in milliseconds, to stop transcribing in your media file
   */
  audio_end_at?: number;

  /**
   * The point in time, in milliseconds, to begin transcribing in your media file
   */
  audio_start_from?: number;

  /**
   * Enable Auto Chapters, can be true or false
   * @default false
   */
  auto_chapters?: boolean;

  /**
   * Enable Key Phrases, either true or false
   * @default false
   */
  auto_highlights?: boolean;

  /**
   * How much to boost specified words
   */
  boost_param?: 'low' | 'default' | 'high';

  /**
   * Enable Content Moderation, can be true or false
   * @default false
   */
  content_safety?: boolean;

  /**
   * The confidence threshold for the Content Moderation model. Values must be between 25 and 100.
   * @default 50
   */
  content_safety_confidence?: number;

  /**
   * Customize how words are spelled and formatted using to and from values
   */
  custom_spelling?: Array<{
    /**
     * Words or phrases to replace
     */
    from: string[];
    /**
     * Word to replace with
     */
    to: string;
  }>;

  /**
   * Transcribe Filler Words, like "umm", in your media file; can be true or false
   * @default false
   */
  disfluencies?: boolean;

  /**
   * Enable Entity Detection, can be true or false
   * @default false
   */
  entity_detection?: boolean;

  /**
   * Filter profanity from the transcribed text, can be true or false
   * @default false
   */
  filter_profanity?: boolean;

  /**
   * Enable Text Formatting, can be true or false
   * @default true
   */
  format_text?: boolean;

  /**
   * Enable Topic Detection, can be true or false
   * @default false
   */
  iab_categories?: boolean;

  /**
   * The language of your audio file. Possible values are found in Supported Languages.
   * @default 'en_us'
   */
  language_code?:
    | 'en'
    | 'en_au'
    | 'en_uk'
    | 'en_us'
    | 'es'
    | 'fr'
    | 'de'
    | 'it'
    | 'pt'
    | 'nl'
    | 'af'
    | 'sq'
    | 'am'
    | 'ar'
    | 'hy'
    | 'as'
    | 'az'
    | 'ba'
    | 'eu'
    | 'be'
    | 'bn'
    | 'bs'
    | 'br'
    | 'bg'
    | 'my'
    | 'ca'
    | 'zh'
    | 'hr'
    | 'cs'
    | 'da'
    | 'et'
    | 'fo'
    | 'fi'
    | 'gl'
    | 'ka'
    | 'el'
    | 'gu'
    | 'ht'
    | 'ha'
    | 'haw'
    | 'he'
    | 'hi'
    | 'hu'
    | 'is'
    | 'id'
    | 'ja'
    | 'jw'
    | 'kn'
    | 'kk'
    | 'km'
    | 'ko'
    | 'lo'
    | 'la'
    | 'lv'
    | 'ln'
    | 'lt'
    | 'lb'
    | 'mk'
    | 'mg'
    | 'ms'
    | 'ml'
    | 'mt'
    | 'mi'
    | 'mr'
    | 'mn'
    | 'ne'
    | 'no'
    | 'nn'
    | 'oc'
    | 'pa'
    | 'ps'
    | 'fa'
    | 'pl'
    | 'ro'
    | 'ru'
    | 'sa'
    | 'sr'
    | 'sn'
    | 'sd'
    | 'si'
    | 'sk'
    | 'sl'
    | 'so'
    | 'su'
    | 'sw'
    | 'sv'
    | 'tl'
    | 'tg'
    | 'ta'
    | 'tt'
    | 'te'
    | 'th'
    | 'bo'
    | 'tr'
    | 'tk'
    | 'uk'
    | 'ur'
    | 'uz'
    | 'vi'
    | 'cy'
    | 'yi'
    | 'yo';

  /**
   * The confidence threshold for the automatically detected language. An error will be returned if the language confidence is below this threshold.
   * @default 0
   */
  language_confidence_threshold?: number;

  /**
   * Enable Automatic language detection, either true or false.
   * @default false
   */
  language_detection?: boolean;

  /**
   * Enable Multichannel transcription, can be true or false.
   * @default false
   */
  multichannel?: boolean;

  /**
   * Enable Automatic Punctuation, can be true or false
   * @default true
   */
  punctuate?: boolean;

  /**
   * Redact PII from the transcribed text using the Redact PII model, can be true or false
   * @default false
   */
  redact_pii?: boolean;

  /**
   * Generate a copy of the original media file with spoken PII "beeped" out, can be true or false.
   * @default false
   */
  redact_pii_audio?: boolean;

  /**
   * Controls the filetype of the audio created by redact_pii_audio. Currently supports mp3 (default) and wav.
   */
  redact_pii_audio_quality?: 'mp3' | 'wav';

  /**
   * The list of PII Redaction policies to enable.
   */
  redact_pii_policies?: Array<
    | 'account_number'
    | 'banking_information'
    | 'blood_type'
    | 'credit_card_cvv'
    | 'credit_card_expiration'
    | 'credit_card_number'
    | 'date'
    | 'date_interval'
    | 'date_of_birth'
    | 'drivers_license'
    | 'drug'
    | 'duration'
    | 'email_address'
    | 'event'
    | 'filename'
    | 'gender_sexuality'
    | 'healthcare_number'
    | 'injury'
    | 'ip_address'
    | 'language'
    | 'location'
    | 'marital_status'
    | 'medical_condition'
    | 'medical_process'
    | 'money_amount'
    | 'nationality'
    | 'number_sequence'
    | 'occupation'
    | 'organization'
    | 'passport_number'
    | 'password'
    | 'person_age'
    | 'person_name'
    | 'phone_number'
    | 'physical_attribute'
    | 'political_affiliation'
    | 'religion'
    | 'statistics'
    | 'time'
    | 'url'
    | 'us_social_security_number'
    | 'username'
    | 'vehicle_id'
    | 'zodiac_sign'
  >;

  /**
   * The replacement logic for detected PII, can be "entity_name" or "hash".
   */
  redact_pii_sub?: 'entity_name' | 'hash';

  /**
   * Enable Sentiment Analysis, can be true or false
   * @default false
   */
  sentiment_analysis?: boolean;

  /**
   * Enable Speaker diarization, can be true or false
   * @default false
   */
  speaker_labels?: boolean;

  /**
   * Tells the speaker label model how many speakers it should attempt to identify, up to 10.
   */
  speakers_expected?: number;

  /**
   * The speech model to use for the transcription.
   */
  speech_model?: 'best' | 'nano';

  /**
   * Reject audio files that contain less than this fraction of speech. Valid values are in the range [0, 1] inclusive.
   */
  speech_threshold?: number;

  /**
   * Enable Summarization, can be true or false
   * @default false
   */
  summarization?: boolean;

  /**
   * The model to summarize the transcript
   */
  summary_model?: 'informative' | 'conversational' | 'catchy';

  /**
   * The type of summary
   */
  summary_type?:
    | 'bullets'
    | 'bullets_verbose'
    | 'gist'
    | 'headline'
    | 'paragraph';

  /**
   * The list of custom topics
   */
  topics?: string[];

  /**
   * The header name to be sent with the transcript completed or failed webhook requests
   */
  webhook_auth_header_name?: string;

  /**
   * The header value to send back with the transcript completed or failed webhook requests for added security
   */
  webhook_auth_header_value?: string;

  /**
   * The URL to which we send webhook requests. We sends two different types of webhook requests.
   * One request when a transcript is completed or failed, and one request when the redacted audio is ready if redact_pii_audio is enabled.
   */
  webhook_url?: string;

  /**
   * The list of custom vocabulary to boost transcription probability for
   */
  word_boost?: string[];
};
