import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://ai.google.dev/gemini-api/docs/google-search
// https://ai.google.dev/api/generate-content#GroundingSupport
// https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-search

export const groundingChunkSchema = z.object({
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

export const googleSearch = createProviderDefinedToolFactory<
  {},
  {
    /**
     * The mode of the predictor to be used in dynamic retrieval. The following modes are supported:
     *  - MODE_DYNAMIC: Run retrieval only when system decides it is necessary
     *  - MODE_UNSPECIFIED: Always trigger retrieval
     * @default MODE_UNSPECIFIED
     */
    mode?: 'MODE_DYNAMIC' | 'MODE_UNSPECIFIED';

    /**
     * The threshold to be used in dynamic retrieval (if not set, a system default value is used).
     */
    dynamicThreshold?: number;
  }
>({
  id: 'google.google_search',
  name: 'google_search',
  inputSchema: z.object({
    mode: z
      .enum(['MODE_DYNAMIC', 'MODE_UNSPECIFIED'])
      .default('MODE_UNSPECIFIED'),
    dynamicThreshold: z.number().default(1),
  }),
});
