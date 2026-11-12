import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

// https://docs.scaledown.ai/api-reference/extract
// Extraction is not included in ScaleDown's published OpenAPI specification.
export const scaledownExtractionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string().nullish(),
      created: z.number().nullish(),
      model: z.string().nullish(),
      choices: z
        .array(z.object({ message: z.object({ content: z.string() }) }))
        .min(1),
      usage: z
        .object({
          prompt_tokens: z.number().nullish(),
          completion_tokens: z.number().nullish(),
        })
        .nullish(),
    }),
  ),
);

export const scaledownExtractionContentSchema = lazySchema(() =>
  zodSchema(
    z.object({
      entities: z.array(
        z.object({
          text: z.string(),
          type: z.string(),
          confidence: z.number(),
          start: z.number().int().nonnegative().nullish(),
          end: z.number().int().nonnegative().nullish(),
        }),
      ),
      input_tokens: z.number().nullish(),
      ocr_text: z.string().nullish(),
    }),
  ),
);
