declare module 'ai-sdk-code-mode' {
  import type { Tool } from '@ai-sdk/provider-utils';

  export type CodeModeToolSet = Record<string, Tool<any, any, any>>;

  export interface CodeModeOptions {
    executionPolicy?: {
      timeoutMs?: number;
      memoryLimitBytes?: number;
      maxStackSizeBytes?: number;
      maxResultBytes?: number;
      maxSourceBytes?: number;
      maxToolInputBytes?: number;
      maxToolOutputBytes?: number;
      maxBridgeRequests?: number;
      maxInFlightBridgeRequests?: number;
    };
    fetchPolicy?:
      | false
      | {
          fetch?: typeof globalThis.fetch;
          allowedOrigins?: string[];
          allowedUrlPrefixes?: string[];
          allowedMethods?: string[];
          maxResponseBytes?: number;
          allowRedirects?: boolean;
          maxRedirects?: number;
        };
  }

  export function createCodeModeTool(
    tools: CodeModeToolSet,
    options?: CodeModeOptions,
  ): Tool<{ js: string }, unknown, any>;
}
