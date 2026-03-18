import type { LanguageModelV4FunctionTool } from '@ai-sdk/provider';
import { asSchema, type ToolSet } from 'ai';

export async function toolsToModelTools(
  tools: ToolSet,
): Promise<LanguageModelV4FunctionTool[]> {
  return Promise.all(
    Object.entries(tools).map(async ([name, tool]) => ({
      type: 'function' as const,
      name,
      description: tool.description,
      inputSchema: await asSchema(tool.inputSchema).jsonSchema,
    })),
  );
}
