import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const webSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      status: z.string().optional(),
      action: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
);

const webSearchToolFactory = createProviderExecutedToolFactory<
  {},
  {
    /**
     * Status of the server-side web search call.
     */
    status?: string;

    /**
     * The search action reported by DeepSeek, such as the query that was run.
     */
    action?: Record<string, unknown>;
  },
  {}
>({
  id: 'deepseek.web_search',
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
  outputSchema: webSearchOutputSchema,
});

/**
 * DeepSeek's server-side web search for the Responses API. DeepSeek runs the
 * searches and page reads during generation and adds the results to the
 * model context. Supported with `deepseek-v4-pro`.
 *
 * Successful searches and page reads are billed per operation and reported in
 * `usage.raw.server_tool_use` and `providerMetadata.deepseek.serverToolUse`.
 */
export const webSearch = (
  args: Parameters<typeof webSearchToolFactory>[0] = {},
) => webSearchToolFactory(args);
