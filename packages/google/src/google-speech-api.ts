import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Response schema for the Gemini `:generateContent` endpoint when called with
 * `responseModalities: ['AUDIO']`. The generated audio is returned as base64
 * encoded raw PCM in the first inline-data part.
 */
export const googleSpeechResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z
        .object({
          message: z.string(),
          code: z.number().nullish(),
        })
        .nullish(),
      usageMetadata: z
        .object({
          promptTokenCount: z.number().nullish(),
          candidatesTokenCount: z.number().nullish(),
        })
        .nullish(),
      promptFeedback: z.object({ blockReason: z.string().nullish() }).nullish(),
      candidates: z
        .array(
          z.object({
            finishReason: z.string().nullish(),
            finishMessage: z.string().nullish(),
            content: z
              .object({
                parts: z
                  .array(
                    z.object({
                      inlineData: z
                        .object({
                          mimeType: z.string().nullish(),
                          data: z.string().nullish(),
                        })
                        .nullish(),
                    }),
                  )
                  .nullish(),
              })
              .nullish(),
          }),
        )
        .nullish(),
    }),
  ),
);
