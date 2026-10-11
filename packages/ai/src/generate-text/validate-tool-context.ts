import { validateTypes, type FlexibleSchema } from '@ai-sdk/provider-utils';

type ToolContextValidationCacheEntry = {
  context: unknown;
  contextSchema: FlexibleSchema<unknown> | undefined;
  result: Promise<unknown>;
};

export type ToolContextValidationCache = Map<
  string,
  ToolContextValidationCacheEntry
>;

export function createToolContextValidationCache(): ToolContextValidationCache {
  return new Map();
}

/**
 * Validates a tool context value against the tool's optional context schema.
 *
 * When no context schema is defined, the original context value is returned as-is.
 * Otherwise, the context is validated and normalized through the schema before
 * being passed into tool execution and approval hooks.
 *
 * @throws {TypeValidationError} When the provided tool context does not match
 * the tool's declared `contextSchema`.
 */
export async function validateToolContext<CONTEXT>({
  toolName,
  context,
  contextSchema,
  cache,
}: {
  toolName: string;
  context: unknown;
  contextSchema: FlexibleSchema<CONTEXT> | undefined;
  cache?: ToolContextValidationCache;
}): Promise<CONTEXT> {
  const cached = cache?.get(toolName);
  if (
    cached != null &&
    cached.context === context &&
    cached.contextSchema === contextSchema
  ) {
    return (await cached.result) as CONTEXT;
  }

  const result =
    contextSchema == null
      ? Promise.resolve(context as CONTEXT)
      : validateTypes({
          value: context,
          schema: contextSchema,
          context: {
            field: 'tool context',
            entityName: toolName,
          },
        });

  cache?.set(toolName, {
    context,
    contextSchema: contextSchema as FlexibleSchema<unknown> | undefined,
    result,
  });

  return await result;
}
