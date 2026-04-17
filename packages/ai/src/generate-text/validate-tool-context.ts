import { type FlexibleSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { InvalidToolContextError } from '../error/invalid-tool-context-error';

/**
 * Validates a tool context value against the tool's optional context schema.
 *
 * When no context schema is defined, the original context value is returned as-is.
 * Otherwise, the context is validated and normalized through the schema before
 * being passed into tool execution and approval hooks.
 *
 * @throws {InvalidToolContextError} When the provided tool context does not match
 * the tool's declared `contextSchema`.
 */
export async function validateToolContext<CONTEXT>({
  toolName,
  context,
  contextSchema,
}: {
  toolName: string;
  context: unknown;
  contextSchema: FlexibleSchema<CONTEXT> | undefined;
}): Promise<CONTEXT> {
  if (contextSchema == null) {
    return context as CONTEXT;
  }

  const contextValidationResult = await safeValidateTypes({
    value: context,
    schema: contextSchema,
  });

  if (!contextValidationResult.success) {
    throw new InvalidToolContextError({
      toolName,
      toolContext: context,
      cause: contextValidationResult.error,
    });
  }

  return contextValidationResult.value;
}
