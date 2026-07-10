import { z } from 'zod/v4';

/**
 * Provider options for Amazon Transcribe batch transcription.
 *
 * Amazon Transcribe reads audio from and (optionally) writes results to Amazon
 * S3. Because the AI SDK `transcribe()` function provides raw audio bytes, the
 * provider uploads the audio to the configured `inputBucket` before starting a
 * transcription job.
 *
 * @see https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html
 */
export const amazonTranscribeTranscriptionModelOptionsSchema = z.object({
  /**
   * Name of the S3 bucket the audio is uploaded to and that Amazon Transcribe
   * reads the audio from. Required.
   */
  inputBucket: z.string(),

  /**
   * Optional key prefix (folder) for the uploaded audio object. The generated
   * object key is `${inputKeyPrefix}${jobName}.${extension}`.
   */
  inputKeyPrefix: z.string().optional(),

  /**
   * Name of the S3 bucket Amazon Transcribe writes the transcript to. When
   * omitted, a service-managed bucket is used and a pre-signed download URL is
   * returned by the API.
   */
  outputBucket: z.string().optional(),

  /**
   * The object key for the transcription output within `outputBucket`.
   */
  outputKey: z.string().optional(),

  /**
   * The name to assign to the transcription job. Must be unique within the AWS
   * account. When omitted, a unique name is generated.
   */
  transcriptionJobName: z.string().optional(),

  /**
   * The language code of the audio, e.g. `'en-US'`. Mutually exclusive with
   * `identifyLanguage` / `identifyMultipleLanguages`. When none of these are
   * set, automatic single-language identification is enabled.
   */
  languageCode: z.string().optional(),

  /**
   * Enables automatic identification of the single language spoken in the audio.
   * Defaults to `true` when neither `languageCode` nor
   * `identifyMultipleLanguages` is set; pass `false` to disable it.
   */
  identifyLanguage: z.boolean().optional(),

  /**
   * Enables automatic identification of multiple languages spoken in the audio.
   */
  identifyMultipleLanguages: z.boolean().optional(),

  /**
   * Restricts automatic language identification to the provided language codes.
   */
  languageOptions: z.array(z.string()).optional(),

  /**
   * The format of the input media (e.g. `'mp3'`, `'mp4'`, `'wav'`, `'flac'`,
   * `'ogg'`, `'amr'`, `'webm'`). When omitted, it is inferred from the audio
   * media type.
   */
  mediaFormat: z.string().optional(),

  /**
   * Sample rate of the audio in Hertz.
   */
  mediaSampleRateHertz: z.number().optional(),

  /**
   * Additional `Settings` passed through to `StartTranscriptionJob`
   * (e.g. `ShowSpeakerLabels`, `MaxSpeakerLabels`, `VocabularyName`).
   *
   * @see https://docs.aws.amazon.com/transcribe/latest/APIReference/API_Settings.html
   */
  settings: z.record(z.string(), z.unknown()).optional(),

  /**
   * Interval in milliseconds between transcription job status polls.
   * Defaults to 3000.
   */
  pollIntervalMillis: z.number().optional(),

  /**
   * Maximum time in milliseconds to wait for the transcription job to complete
   * before timing out. Defaults to 600000 (10 minutes).
   */
  maxPollDurationMillis: z.number().optional(),
});

export type AmazonTranscribeTranscriptionModelOptions = z.infer<
  typeof amazonTranscribeTranscriptionModelOptionsSchema
>;
