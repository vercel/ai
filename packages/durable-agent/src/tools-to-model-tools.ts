import type { LanguageModelV3FunctionTool } from '@ai-sdk/provider';
import { asSchema, type ToolSet } from 'ai';

export function toolsToModelTools(
  tools: ToolSet,
): LanguageModelV3FunctionTool[] {
  return Object.entries(tools).map(([name, tool]) => ({
    type: 'function',
    name,
    description: tool.description,
    inputSchema: asSchema(tool.inputSchema).jsonSchema,
  }));
}
