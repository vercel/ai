import { createProviderDefinedToolFactoryWithOutputSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://ai.google.dev/gemini-api/docs/url-context
const groundingChunkSchema = z.object({
  web: z.object({ uri: z.string(), title: z.string() }).nullish(),
  retrievedContext: z.object({ uri: z.string(), title: z.string() }).nullish(),
});

export const groundingMetadataSchema = z.object({
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
  webSearchQueries: z.array(z.string()).nullish(),
});

// https://ai.google.dev/api/generate-content#UrlRetrievalMetadata
const urlMetadataSchema = z.object({
  retrievedUrl: z.string(),
  urlRetrievalStatus: z.string(),
});

export const urlContextMetadataSchema = z.object({
  urlMetadata: z.array(urlMetadataSchema),
});

export const urlContextOutputSchema = z.object({
  groundingMetadata: groundingMetadataSchema,
  urlContextMetadata: urlContextMetadataSchema,
});

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  {},
  z.infer<typeof urlContextOutputSchema>,
  {}
>({
  id: 'google.url_context',
  name: 'url_context',
  inputSchema: z.object({}),
  outputSchema: urlContextOutputSchema,
});

export const urlContext = (
  args: Parameters<typeof factory>[0] = {}, // default
) => {
  return factory(args);
};
