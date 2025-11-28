import {
  createProviderDefinedToolFactoryWithOutputSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Output schema for the Tool Search Tool.
 * The tool returns a list of matching tool names based on the regex search.
 */
export const toolSearch_20251119OutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      matched_tools: z.array(z.string()).describe('List of tool names that matched the search pattern'),
    }),
  ),
);

/**
 * Input schema for the Tool Search Tool.
 * The model provides a regex pattern to search for matching tools.
 */
export const toolSearch_20251119InputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      pattern: z.string().describe('Regex pattern to search for matching tools'),
    }),
  ),
);

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  {
    /**
     * Regex pattern to search for matching tools.
     */
    pattern: string;
  },
  {
    /**
     * List of tool names that matched the search pattern.
     */
    matched_tools: string[];
  },
  {
    // no arguments
  }
>({
  id: 'anthropic.tool_search_20251119',
  name: 'tool_search_tool_regex',
  inputSchema: toolSearch_20251119InputSchema,
  outputSchema: toolSearch_20251119OutputSchema,
});

/**
 * Creates a Tool Search Tool that enables Claude to dynamically discover tools on-demand.
 *
 * The Tool Search Tool allows Claude to search for relevant tools using regex patterns
 * rather than loading all tool definitions upfront. This can significantly reduce token usage
 * when working with many tools.
 *
 * Use this tool in combination with `deferLoading: true` on your other tools to enable
 * dynamic tool discovery.
 *
 * @example
 * ```typescript
 * import { anthropic } from '@ai-sdk/anthropic';
 * import { generateText, tool } from 'ai';
 *
 * const result = await generateText({
 *   model: anthropic('claude-sonnet-4-5-20250929'),
 *   tools: {
 *     tool_search_tool_regex: anthropic.tools.toolSearch_20251119(),
 *     createPullRequest: tool({
 *       description: 'Create a pull request',
 *       inputSchema: z.object({ ... }),
 *       providerOptions: {
 *         anthropic: { deferLoading: true }
 *       }
 *     }),
 *   },
 *   prompt: '...',
 * });
 * ```
 *
 * @see https://www.anthropic.com/engineering/advanced-tool-use
 */
export const toolSearch_20251119 = (
  args: Parameters<typeof factory>[0] = {},
) => {
  return factory(args);
};
