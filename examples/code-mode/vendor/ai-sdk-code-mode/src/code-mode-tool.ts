import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { runCodeMode } from './run-code-mode.js';
import { buildCodeModeToolDescription } from './tool-prompt.js';
import type {
  CodeModeOptions,
  CodeModeToolInput,
  CodeModeToolSet,
} from './types.js';

/**
 * Creates an AI SDK tool that executes JavaScript or type-stripped TypeScript
 * in an isolated QuickJS sandbox.
 *
 * The generated tool description includes sandbox rules, available host tool
 * signatures, return types when an AI SDK output schema is present, call
 * examples, and fetch policy details when fetch is enabled.
 *
 * @param tools - Host tools that sandboxed code can call through `tools.name(input)`.
 * @param options - Runtime, fetch, and approval options for every invocation of this tool.
 * @returns An AI SDK tool whose input is `{ js: string }` and whose output is the sandbox return value.
 */
export function createCodeModeTool(
  tools: CodeModeToolSet,
  options: CodeModeOptions = {},
) {
  const description = buildCodeModeToolDescription(tools, options);

  return tool<CodeModeToolInput, unknown, any>({
    description,
    inputSchema: z.object({
      js: z
        .string()
        .describe(
          'JavaScript or type-stripped TypeScript source to execute. The tool description lists the available global `tools` API, input types, and call examples.',
        ),
    }),
    execute: async ({ js }, executionOptions) =>
      await runCodeMode({
        js,
        tools,
        toolExecutionOptions: executionOptions,
        options,
      }),
  });
}
