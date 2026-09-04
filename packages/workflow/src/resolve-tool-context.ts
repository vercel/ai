import { validateTypes, type Context, type Tool } from '@ai-sdk/provider-utils';

/**
 * Resolves the per-tool context passed to tool callbacks and execution.
 * Context schemas validate and normalize the value before any tool-owned
 * callback observes it.
 */
export async function resolveToolContext({
  toolName,
  tool,
  toolsContext,
}: {
  toolName: string;
  tool: Tool;
  toolsContext: Record<string, Context | undefined> | undefined;
}): Promise<unknown> {
  const contextSchema = tool.contextSchema;
  const entry = toolsContext?.[toolName];
  if (contextSchema == null) {
    return entry;
  }

  return await validateTypes({
    value: entry,
    schema: contextSchema,
    context: { field: 'tool context', entityName: toolName },
  });
}
