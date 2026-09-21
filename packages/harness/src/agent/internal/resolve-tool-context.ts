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
  const hasConfiguredContext = Object.prototype.hasOwnProperty.call(
    toolsContext,
    toolName,
  );
  const context = hasConfiguredContext ? toolsContext[toolName] : undefined;

  // Preserve closure-bound contextual tools: before toolsContext support,
  // wrappers could inject context from inside execute(). Only validate context
  // that HarnessAgent was explicitly configured to provide.
  if (!hasConfiguredContext || tool.contextSchema == null) {
    return context;
  }

  return await validateTypes({
    value: context,
    schema: tool.contextSchema,
    context: { field: 'tool context', entityName: toolName },
  });
}
