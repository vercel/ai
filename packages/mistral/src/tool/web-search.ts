import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const webSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: z.string().optional(),
    }),
  ),
);

const webSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      info: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
);

const webSearchToolFactory = createProviderExecutedToolFactory<
  {
    query?: string;
  },
  {
    info?: Record<string, unknown>;
  },
  {}
>({
  id: 'mistral.web_search',
  inputSchema: webSearchInputSchema,
  outputSchema: webSearchOutputSchema,
});

export const webSearch = (
  args: Parameters<typeof webSearchToolFactory>[0] = {},
) => webSearchToolFactory(args);
