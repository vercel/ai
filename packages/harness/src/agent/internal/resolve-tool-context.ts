import { validateTypes, type Context, type Tool } from '@ai-sdk/provider-utils';

/**
 * Resolves and validates the context for one host-executed tool.
 */
export async function resolveToolContext({
  toolName,
  tool,
  toolsContext,
}: {
  toolName: string;
  tool: Tool;
  toolsContext: Record<string, Context | undefined>;
}): Promise<unknown> {
  const context = Object.prototype.hasOwnProperty.call(toolsContext, toolName)
    ? toolsContext[toolName]
    : undefined;

  if (tool.contextSchema == null) {
    return context;
  }

  return await validateTypes({
    value: context,
    schema: tool.contextSchema,
    context: { field: 'tool context', entityName: toolName },
  });
}
