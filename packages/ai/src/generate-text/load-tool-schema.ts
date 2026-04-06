import { asSchema, tool } from '@ai-sdk/provider-utils';
import type { Tool, ToolSet } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const LOAD_TOOL_SCHEMA_NAME = '__load_tool_schema__';

type LoadToolSchemaResult = Record<
  string,
  | {
      inputSchema: unknown;
      skill?: string;
      inputExamples?: unknown[];
    }
  | { error: string }
>;

export function createLoadToolSchemaTool(
  lazyTools: ToolSet,
): Tool<{ toolNames: string[] }, LoadToolSchemaResult> {
  const toolNames = Object.keys(lazyTools);

  return tool({
    description: `Load the full input schema for lazy tools. Available lazy tools: ${toolNames.join(', ')}`,
    inputSchema: z.object({
      toolNames: z.array(z.string()),
    }),
    async execute({ toolNames: requestedNames }) {
      const result: LoadToolSchemaResult = {};

      for (const name of requestedNames) {
        const t = lazyTools[name];
        if (t == null) {
          result[name] = {
            error: `Tool '${name}' is not a lazy tool or does not exist`,
          };
          continue;
        }

        const entry: {
          inputSchema: unknown;
          skill?: string;
          inputExamples?: unknown[];
        } = {
          inputSchema: await asSchema(t.inputSchema).jsonSchema,
        };

        if (t.skill != null) {
          entry.skill = t.skill;
        }

        if (t.inputExamples != null) {
          entry.inputExamples = t.inputExamples;
        }

        result[name] = entry;
      }

      return result;
    },
  });
}

export function buildEffectiveTools<TOOLS extends ToolSet>(
  tools: TOOLS | undefined,
): TOOLS | undefined {
  if (tools == null) {
    return undefined;
  }

  const lazyTools = Object.fromEntries(
    Object.entries(tools).filter(([_, t]) => t.lazy),
  ) as ToolSet;

  if (Object.keys(lazyTools).length === 0) {
    return tools;
  }

  return {
    ...tools,
    ...(tools[LOAD_TOOL_SCHEMA_NAME]
      ? {}
      : { [LOAD_TOOL_SCHEMA_NAME]: createLoadToolSchemaTool(lazyTools) }),
  } as TOOLS;
}
