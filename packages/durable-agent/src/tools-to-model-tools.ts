import type { LanguageModelV3FunctionTool } from '@ai-sdk/provider';
import { asSchema, type ToolSet } from 'ai';

export async function toolsToModelTools(
  tools: ToolSet,
): Promise<LanguageModelV3FunctionTool[]> {
  return Promise.all(
    Object.entries(tools).map(async ([name, tool]) => ({
      type: 'function' as const,
      name,
      description: tool.description,
      inputSchema: await asSchema(tool.inputSchema).jsonSchema,
    })),
  );
}
