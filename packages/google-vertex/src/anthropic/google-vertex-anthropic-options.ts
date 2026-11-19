import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { GoogleVertexModelIds } from '../google-vertex-model-catalog';

export const googleVertexAnthropicProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
      labels: z.record(z.string(), z.string()).optional(),
    }),
  ),
);

// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude
export type GoogleVertexAnthropicModelId =
  | GoogleVertexModelIds['anthropic']
  | (string & {});
