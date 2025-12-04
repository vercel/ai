import { JSONSchema7 } from '@ai-sdk/provider';

export interface DeferredToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  keywords: string[];
  allowedCallers: string[];
  examples: unknown[];
}

export interface RegisteredRuntimeTool {
  name: string;
  description: string;
  inputSchema: any;
  keywords: string[];
  allowedCallers: string[];
  examples: unknown[];
}

class ToolSearchRegistry {
  tools: RegisteredRuntimeTool[] = [];

  register(tool: RegisteredRuntimeTool) {
    this.tools.push({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? {},
      keywords: tool.keywords ?? [],
      allowedCallers: tool.allowedCallers ?? [],
      examples: tool.examples ?? [],
    });
  }

  list(): RegisteredRuntimeTool[] {
    return [...this.tools];
  }
}

export const toolSearchRegistry = new ToolSearchRegistry();
