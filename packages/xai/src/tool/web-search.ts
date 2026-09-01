import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const webSearchArgsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      allowedDomains: z.array(z.string()).max(5).optional(),
      excludedDomains: z.array(z.string()).max(5).optional(),
      enableImageSearch: z.boolean().optional(),
      enableImageUnderstanding: z.boolean().optional(),
    }),
  ),
);

export const webSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      action: z
        .discriminatedUnion('type', [
          z.object({
            type: z.literal('search'),
            query: z.string().optional(),
            queries: z.array(z.string()).optional(),
          }),
          z.object({
            type: z.literal('openPage'),
            url: z.string().nullish(),
          }),
          z.object({
            type: z.literal('findInPage'),
            url: z.string().nullish(),
            pattern: z.string().nullish(),
          }),
        ])
        .optional(),
      sources: z
        .array(z.object({ type: z.literal('url'), url: z.string() }))
        .optional(),
    }),
  ),
);

const webSearchToolFactory = createProviderExecutedToolFactory<
  {},
  {
    action?:
      | {
          type: 'search';
          query?: string;
          queries?: string[];
        }
      | {
          type: 'openPage';
          url?: string | null;
        }
      | {
          type: 'findInPage';
          url?: string | null;
          pattern?: string | null;
        };
    sources?: Array<{ type: 'url'; url: string }>;
  },
  {
    allowedDomains?: string[];
    excludedDomains?: string[];
    enableImageSearch?: boolean;
    enableImageUnderstanding?: boolean;
  }
>({
  id: 'xai.web_search',
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
  outputSchema: webSearchOutputSchema,
});

export const webSearch = (
  args: Parameters<typeof webSearchToolFactory>[0] = {},
) => webSearchToolFactory(args);
