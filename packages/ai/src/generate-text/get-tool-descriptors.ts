import { LanguageModelV4FunctionTool } from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import { isNonEmptyObject } from '../util/is-non-empty-object';
import { ToolSet } from './tool-set';

/**
 * Extracts serializable tool descriptors (name, description, JSON schema)
 * from a ToolSet. This strips non-serializable properties like `execute`
 * functions and Zod schema instances, producing plain objects suitable
 * for sending to providers, serializing across process boundaries, or
 * inspecting tool schemas at runtime.
 *
 * Only function/dynamic tools are included. Provider tools are excluded
 * since they don't have user-defined schemas.
 */
export async function getToolDescriptors<TOOLS extends ToolSet>(
  tools: TOOLS | undefined,
): Promise<LanguageModelV4FunctionTool[]> {
  if (!isNonEmptyObject(tools)) {
    return [];
  }

  const descriptors: LanguageModelV4FunctionTool[] = [];
  for (const [name, tool] of Object.entries(tools)) {
    const toolType = tool.type;

    switch (toolType) {
      case undefined:
      case 'dynamic':
      case 'function':
        descriptors.push({
          type: 'function' as const,
          name,
          description: tool.description,
          inputSchema: await asSchema(tool.inputSchema).jsonSchema,
          ...(tool.inputExamples != null
            ? { inputExamples: tool.inputExamples }
            : {}),
          providerOptions: tool.providerOptions,
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        });
        break;
      case 'provider':
        // Provider tools don't have user-defined schemas — skip
        break;
      default: {
        const exhaustiveCheck: never = toolType as never;
        throw new Error(`Unsupported tool type: ${exhaustiveCheck}`);
      }
    }
  }

  return descriptors;
}
