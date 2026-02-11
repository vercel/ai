import {
  createProviderToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://ai.google.dev/gemini-api/docs/google-search
// https://ai.google.dev/api/generate-content#GroundingSupport
// https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-search

export const googleSearch = createProviderToolFactory<
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
  inputSchema: lazySchema(() =>
    zodSchema(
      z.object({
        mode: z
          .enum(['MODE_DYNAMIC', 'MODE_UNSPECIFIED'])
          .default('MODE_UNSPECIFIED'),
        dynamicThreshold: z.number().default(1),
      }),
    ),
  ),
});
