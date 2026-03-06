import { JSONObject } from '@ai-sdk/provider';
import {
  createProviderToolFactoryWithOutputSchema,
  FlexibleSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const toolSearchArgsSchema = lazySchema(() => zodSchema(z.object({})));

/**
 * The input shape for tool search (the arguments from tool_search_call).
 * In hosted mode, this contains the search paths/arguments used by the model.
 */
export type ToolSearchInput = {
  /**
   * The arguments from the tool_search_call.
   * This is preserved for multi-turn conversation reconstruction.
   */
  arguments?: unknown;
};

export const toolSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      arguments: z.unknown().optional(),
    }),
  ),
);

/**
 * The output shape returned by the tool search.
 * Contains the loaded tool definitions.
 */
export type ToolSearchOutput = {
  /**
   * The tools that were loaded by the tool search.
   * These are the deferred tools that the model requested to load.
   * Each tool is represented as a JSON object with properties depending on its type.
   *
   * Common properties include:
   * - `type`: The type of the tool (e.g., 'function', 'web_search', etc.)
   * - `name`: The name of the tool (for function tools)
   * - `description`: A description of the tool
   * - `deferLoading`: Whether this tool was deferred (had defer_loading: true)
   * - `parameters`: The JSON Schema for the function parameters (for function tools)
   * - `strict`: Whether to enable strict schema adherence (for function tools)
   */
  tools: Array<JSONObject>;
};

export const toolSearchOutputSchema: FlexibleSchema<ToolSearchOutput> =
  lazySchema(() =>
    zodSchema(
      z.object({
        tools: z.array(z.record(z.string(), z.unknown())),
      }),
    ),
  ) as FlexibleSchema<ToolSearchOutput>;

export const toolSearchToolFactory = createProviderToolFactoryWithOutputSchema<
  ToolSearchInput,
  ToolSearchOutput,
  {
    // No user configuration needed for hosted tool search
  }
>({
  id: 'openai.tool_search',
  inputSchema: toolSearchInputSchema,
  outputSchema: toolSearchOutputSchema,
});

export const toolSearch = (
  args: Parameters<typeof toolSearchToolFactory>[0] = {},
) => toolSearchToolFactory(args);
