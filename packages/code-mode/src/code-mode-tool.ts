import {
  experimental_toolCaller,
  jsonSchema,
  tool,
  type Experimental_ToolCallerTool,
} from 'ai';
import { runCodeMode } from './run-code-mode.js';
import {
  buildCodeModeToolCatalogMessage,
  buildCodeModeToolDescription,
} from './tool-prompt.js';
import type {
  CodeModeOptions,
  CodeModeTool,
  CodeModeToolInput,
  CodeModeToolOptions,
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
  return createCodeModeToolWithDiscovery(tools, options, 'description');
}

function createCodeModeToolWithDiscovery(
  tools: CodeModeToolSet,
  options: CodeModeOptions,
  toolDiscovery: 'description' | 'conversation',
): CodeModeTool {
  return tool<CodeModeToolInput, unknown, Record<string, unknown>>({
    description: buildCodeModeToolDescription(tools, toolDiscovery),
    inputSchema: jsonSchema<CodeModeToolInput>({
      type: 'object',
      properties: {
        js: {
          type: 'string',
          description:
            'Code-mode TypeScript source to execute. The code-mode context lists the available global `tools` API, input types, and call examples.',
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

/**
 * Creates a code-mode caller whose host tools are bound by the surrounding
 * AI SDK generation call.
 */
export function codeModeTool(
  options: CodeModeToolOptions = {},
): Experimental_ToolCallerTool<CodeModeTool> {
  const { toolDiscovery = 'description', ...codeModeOptions } = options;

  return experimental_toolCaller(
    createCodeModeToolWithDiscovery({}, codeModeOptions, toolDiscovery),
    {
      type: 'local',
      bind: tools =>
        createCodeModeToolWithDiscovery(
          tools as unknown as CodeModeToolSet,
          codeModeOptions,
          toolDiscovery,
        ),
      ...(toolDiscovery === 'conversation'
        ? {
            prepareModelMessage: tools =>
              buildCodeModeToolCatalogMessage(
                tools as unknown as CodeModeToolSet,
              ),
          }
        : {}),
    },
  );
}
