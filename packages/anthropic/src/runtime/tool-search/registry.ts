import { JSONSchema7 } from "@ai-sdk/provider";

export interface RegisteredRuntimeTool {
  name: string;
  description?: string;
  inputSchema?: JSONSchema7;
  keywords?: string[];
  allowedCallers?: string[];
  examples?: unknown[];
}

class ToolSearchRegistry {
  private tools: RegisteredRuntimeTool[] = [];

  register(tool: RegisteredRuntimeTool) {
    this.tools.push(tool);
  }

  list() {
    return this.tools;
  }
}

export const toolSearchRegistry = new ToolSearchRegistry();
