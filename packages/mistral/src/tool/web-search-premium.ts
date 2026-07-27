import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const webSearchPremiumInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: z.string().optional(),
    }),
  ),
);

const webSearchPremiumOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      info: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
);

const webSearchPremiumToolFactory = createProviderExecutedToolFactory<
  {
    query?: string;
  },
  {
    info?: Record<string, unknown>;
  },
  {}
>({
  id: 'mistral.web_search_premium',
  inputSchema: webSearchPremiumInputSchema,
  outputSchema: webSearchPremiumOutputSchema,
});

export const webSearchPremium = (
  args: Parameters<typeof webSearchPremiumToolFactory>[0] = {},
) => webSearchPremiumToolFactory(args);
