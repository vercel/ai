import { JSONSchema7 } from "@ai-sdk/provider";

export interface DeferredToolDefinition {
  name: string;
  description?: string;
  inputSchema?: JSONSchema7;
  keywords?: string[];
  allowedCallers?: string[];
  examples?: unknown[];
}

export interface RankedToolResult {
  tool: DeferredToolDefinition;
  score: number;
}
