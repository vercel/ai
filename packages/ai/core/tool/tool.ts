import { Tool } from '@ai-sdk/provider-utils';

/**
Helper function for inferring the execute args of a tool.
 */
// Note: overload order is important for auto-completion
export function tool<INPUT, OUTPUT>(
  tool: Tool<INPUT, OUTPUT>,
): Tool<INPUT, OUTPUT>;
export function tool<INPUT>(tool: Tool<INPUT, never>): Tool<INPUT, never>;
export function tool<OUTPUT>(tool: Tool<never, OUTPUT>): Tool<never, OUTPUT>;
export function tool(tool: Tool<never, never>): Tool<never, never>;
export function tool(tool: any): any {
  return tool;
}
