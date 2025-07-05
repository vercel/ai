import { createProviderDefinedToolFactoryWithOutputSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://ai.google.dev/gemini-api/docs/google-search
// https://ai.google.dev/api/generate-content#GroundingSupport
// https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-search
const groundingChunkSchema = z.object({
  web: z.object({ uri: z.string(), title: z.string() }).nullish(),
  retrievedContext: z.object({ uri: z.string(), title: z.string() }).nullish(),
});

export const groundingMetadataSchema = z.object({
  webSearchQueries: z.array(z.string()).nullish(),
  retrievalQueries: z.array(z.string()).nullish(),
  searchEntryPoint: z.object({ renderedContent: z.string() }).nullish(),
  groundingChunks: z.array(groundingChunkSchema).nullish(),
  groundingSupports: z
    .array(
      z.object({
        segment: z.object({
          startIndex: z.number().nullish(),
          endIndex: z.number().nullish(),
          text: z.string().nullish(),
        }),
        segment_text: z.string().nullish(),
        groundingChunkIndices: z.array(z.number()).nullish(),
        supportChunkIndices: z.array(z.number()).nullish(),
        confidenceScores: z.array(z.number()).nullish(),
        confidenceScore: z.array(z.number()).nullish(),
      }),
    )
    .nullish(),
  retrievalMetadata: z
    .union([
      z.object({
        webDynamicRetrievalScore: z.number(),
      }),
      z.object({}),
    ])
    .nullish(),
});

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  {},
  z.infer<typeof groundingMetadataSchema>,
  {}
>({
  id: 'google.google_search',
  name: 'google_search',
  inputSchema: z.object({
    mode: z.enum(['MODE_DYNAMIC', 'MODE_STATIC']).default('MODE_DYNAMIC'),
    dynamicThreshold: z.number().default(1),
  }),
  outputSchema: groundingMetadataSchema,
});

export const googleSearch = (
  args: Parameters<typeof factory>[0] = {}, // default
) => {
  return factory(args);
};
