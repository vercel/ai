import type { LanguageModelV2FunctionTool } from '@ai-sdk/provider';
import { asSchema, type ToolSet } from 'ai';

export function toolsToModelTools(
  tools: ToolSet,
): LanguageModelV2FunctionTool[] {
  return Object.entries(tools).map(([name, tool]) => {
    const schema = asSchema(tool.inputSchema);
    return {
      type: 'function' as const,
      name,
      description: tool.description,
      inputSchema: schema.jsonSchema as any,
    };
  });
}
