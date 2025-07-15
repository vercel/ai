import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://ai.google.dev/api/generate-content#UrlRetrievalMetadata
const urlMetadataSchema = z.object({
  retrievedUrl: z.string(),
  urlRetrievalStatus: z.string(),
});

export const urlContextMetadataSchema = z.object({
  urlMetadata: z.array(urlMetadataSchema),
});

export const urlContext = createProviderDefinedToolFactory<
  {
    // Url context does not have any input schema, it will directly use the url from the prompt
  },
  {}
>({
  id: 'google.url_context',
  name: 'url_context',
  inputSchema: z.object({}),
});
