import {
  InferValidator,
  lazyValidator,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

export type OpenAITranscriptionModelId =
  | 'whisper-1'
  | 'gpt-4o-mini-transcribe'
  | 'gpt-4o-transcribe'
  | (string & {});

// https://platform.openai.com/docs/api-reference/audio/createTranscription
export const openAITranscriptionProviderOptions = lazyValidator(() =>
  zodSchema(
    z.object({
      /**
       * Additional information to include in the transcription response.
       */

      include: z.array(z.string()).optional(),

      /**
       * The language of the input audio in ISO-639-1 format.
       */
      language: z.string().optional(),

      /**
       * An optional text to guide the model's style or continue a previous audio segment.
       */
      prompt: z.string().optional(),

      /**
       * The sampling temperature, between 0 and 1.
       * @default 0
       */
      temperature: z.number().min(0).max(1).default(0).optional(),

      /**
       * The timestamp granularities to populate for this transcription.
       * @default ['segment']
       */
      timestampGranularities: z
        .array(z.enum(['word', 'segment']))
        .default(['segment'])
        .optional(),
    }),
  ),
);

export type OpenAITranscriptionProviderOptions = InferValidator<
  typeof openAITranscriptionProviderOptions
>;
