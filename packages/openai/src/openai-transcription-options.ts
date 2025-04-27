import { z } from 'zod';

export type OpenAITranscriptionModelId =
  | 'whisper-1'
  | 'gpt-4o-mini-transcribe'
  | 'gpt-4o-transcribe'
  | (string & {});

// https://platform.openai.com/docs/api-reference/audio/createTranscription
export const openAITranscriptionProviderOptions = z.object({
  /**
   * Additional information to include in the transcription response.
   */

  include: z.array(z.string()).nullish(),

  /**
   * The language of the input audio in ISO-639-1 format.
   */
  language: z.string().nullish(),

  /**
   * An optional text to guide the model's style or continue a previous audio segment.
   */
  prompt: z.string().nullish(),

  /**
   * The sampling temperature, between 0 and 1.
   * @default 0
   */
  temperature: z.number().min(0).max(1).default(0).nullish(),

  /**
   * The timestamp granularities to populate for this transcription.
   * @default ['segment']
   */
  timestampGranularities: z
    .array(z.enum(['word', 'segment']))
    .default(['segment'])
    .nullish(),
});

export type OpenAITranscriptionProviderOptions = z.infer<
  typeof openAITranscriptionProviderOptions
>;
