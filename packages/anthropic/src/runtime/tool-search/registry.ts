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
  description?: string;
  inputSchema?: JSONSchema7;
  keywords?: string[];
  allowedCallers?: string[];
  examples?: unknown[];
}

class ToolSearchRegistry {
  private tools: DeferredToolDefinition[] = [];

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

  list() {
    return this.tools;
  }
}

export const toolSearchRegistry = new ToolSearchRegistry();
