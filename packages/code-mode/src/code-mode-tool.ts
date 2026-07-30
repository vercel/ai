import { jsonSchema, tool } from 'ai';
import { runCodeMode } from './run-code-mode.js';
import { buildCodeModeToolDescription } from './tool-prompt.js';
import type {
  CodeModeOptions,
  CodeModeTool,
  CodeModeToolInput,
  CodeModeToolSet,
} from './types.js';

/**
 * Creates an AI SDK tool that executes code-mode TypeScript in an isolated
 * sandbox.
 */
export function createCodeModeTool(
  tools: CodeModeToolSet,
  options: CodeModeOptions = {},
): CodeModeTool {
  return tool<CodeModeToolInput, unknown, Record<string, unknown>>({
    description: buildCodeModeToolDescription(tools),
    inputSchema: jsonSchema<CodeModeToolInput>({
      type: 'object',
      properties: {
        js: {
          type: 'string',
          description:
            'Code-mode TypeScript source to execute. The tool description lists the available global `tools` API, input types, and call examples.',
        },
      },
      required: ['js'],
      additionalProperties: false,
    }),
    execute: async (input, executionOptions) =>
      await runCodeMode({
        js: input.js,
        tools,
        toolExecutionOptions: executionOptions,
        options,
      }),
  }) as CodeModeTool;
}
