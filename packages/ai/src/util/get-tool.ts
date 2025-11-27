import type { ToolSet } from 'ai';

/**
This function gets tool from tools object based on the either:
- name property in tool definition
- the key value in the object itself
 * */
export function getTool(toolName: string, tools: ToolSet | undefined) {
  if (!tools) return undefined;

  return (
    Object.entries(tools).find(([_, tool]) => tool?.name === toolName) ??
    tools[toolName]
  );
}
