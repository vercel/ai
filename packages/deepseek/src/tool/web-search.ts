import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const webSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      action: z
        .discriminatedUnion('type', [
          z.object({
            type: z.literal('search'),
            queries: z.array(z.string()).optional(),
          }),
          z.object({
            type: z.literal('openPage'),
            url: z.string().nullish(),
          }),
        ])
        .optional(),
    }),
  ),
);

const webSearchToolFactory = createProviderExecutedToolFactory<
  {
    // Web search takes no input - it is controlled by the prompt.
  },
  {
    /**
     * What the model did in this web search call.
     */
    action?:
      | {
          /**
           * The model ran one or more search queries.
           */
          type: 'search';

          /**
           * The queries the model searched for.
           */
          queries?: string[];
        }
      | {
          /**
           * The model opened a page from the search results.
           */
          type: 'openPage';

          /**
           * The URL the model opened.
           */
          url?: string | null;
        };
  },
  {
    // DeepSeek ignores `search_context_size` and `user_location`, so the tool
    // takes no configuration.
  }
>({
  id: 'deepseek.web_search',
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
  outputSchema: webSearchOutputSchema,
});

/**
 * Lets the model search the web. DeepSeek runs the searches on its own
 * servers, so no requests are made from your application.
 *
 * Only available on models created with `deepSeek.responses()`.
 *
 * @see https://api-docs.deepseek.com/guides/responses_api
 */
export const webSearch = (
  args: Parameters<typeof webSearchToolFactory>[0] = {},
) => webSearchToolFactory(args);
