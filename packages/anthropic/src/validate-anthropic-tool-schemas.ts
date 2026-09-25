import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
} from '@ai-sdk/provider';
import { asSchema, type Tool } from '@ai-sdk/provider-utils';

/**
 * Checks custom tool schemas against Anthropic's root schema restrictions.
 *
 * Call from a build script or before selecting an Anthropic model, including
 * through a gateway. Resolves lazy schemas without making a model request or
 * executing tools. Provider-defined tools are skipped.
 *
 * This does not check all model-specific or strict-mode schema restrictions.
 * Tools discovered at runtime must be checked when they become available.
 *
 * @throws UnsupportedFunctionalityError if a tool has an incompatible root.
 */
export async function validateAnthropicToolSchemas({
  tools,
}: {
  tools: Record<string, Tool>;
}): Promise<void> {
  for (const [toolName, tool] of Object.entries(tools)) {
    if (tool.type === 'provider') {
      continue;
    }

    validateAnthropicToolSchema({
      toolName,
      inputSchema: await asSchema(tool.inputSchema).jsonSchema,
    });
  }
}

export function validateAnthropicToolSchema({
  toolName,
  inputSchema,
}: {
  toolName: string;
  inputSchema: JSONSchema7;
}): void {
  if (
    inputSchema.type !== 'object' ||
    inputSchema.anyOf != null ||
    inputSchema.oneOf != null ||
    inputSchema.allOf != null
  ) {
    throw new UnsupportedFunctionalityError({
      functionality: 'Anthropic tool input schema',
      message:
        `Tool '${toolName}' has an unsupported input schema for Anthropic. ` +
        `Use type 'object' at the root, without anyOf, oneOf, or allOf. ` +
        `Wrap the schema in an object property, e.g. z.object({ request: schema }).`,
    });
  }
}
