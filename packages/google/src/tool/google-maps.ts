import {
  createProviderDefinedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://ai.google.dev/gemini-api/docs/maps-grounding
// https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-maps

export const googleMaps = createProviderDefinedToolFactory<{}, {}>({
  id: 'google.google_maps',
  name: 'google_maps',
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
});
