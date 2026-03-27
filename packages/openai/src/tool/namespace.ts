import {
  createProviderToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const namespaceArgsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      tools: z.array(
        z.object({
          type: z.literal('function'),
          name: z.string(),
          description: z.string().optional(),
          defer_loading: z.boolean().optional(),
          parameters: z.record(z.string(), z.unknown()).optional(),
          strict: z.boolean().optional(),
        }),
      ),
    }),
  ),
);

const namespaceToolFactory = createProviderToolFactory<{
  /**
   * The name of the namespace. Used to group related tools together.
   * Convention: use lowercase with underscores (e.g., 'mcp_github').
   */
  name: string;

  /**
   * A description of the namespace and the tools it contains.
   * Helps the model understand when to search within this namespace.
   */
  description?: string;

  /**
   * The tools within this namespace. Each tool is a function definition
   * that can optionally have `defer_loading: true` to be lazily loaded
   * via the tool_search mechanism.
   */
  tools: Array<{
    type: 'function';
    name: string;
    description?: string;
    defer_loading?: boolean;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  }>;
}>({
  id: 'openai.namespace',
});

export const namespace = (
  args: Parameters<typeof namespaceToolFactory>[0],
) => namespaceToolFactory(args);
