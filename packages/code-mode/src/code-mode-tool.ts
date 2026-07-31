import {
  experimental_toolCaller,
  jsonSchema,
  tool,
  type Experimental_ToolWithCaller,
} from 'ai';
import {
  continueCodeModeApproval,
  isCodeModeApprovalInterrupt,
} from './approval-continuation.js';
import { getCodeModeInterrupt } from './interrupt-continuation.js';
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

/**
 * Creates a code-mode caller whose host tools are bound by the surrounding
 * AI SDK generation call.
 */
export function codeModeTool(
  options: CodeModeOptions = {},
): Experimental_ToolWithCaller<CodeModeTool> {
  return experimental_toolCaller(createCodeModeTool({}, options), {
    type: 'local',
    bind: (tools, context) =>
      createCodeModeTool(tools as unknown as CodeModeToolSet, {
        ...options,
        approval: {
          ...options.approval,
          mode: 'interrupt',
          resolve: context.resolveToolApproval,
        },
      }),
    getApprovalRequest: output => {
      const interrupt = getCodeModeInterrupt(
        output,
        options.continuationSecurity,
      );
      if (
        !isCodeModeApprovalInterrupt(interrupt, options.continuationSecurity)
      ) {
        return undefined;
      }
      return {
        approvalId: interrupt.interruptId,
        callerToolCallId: interrupt.outerToolCallId,
        toolCall: {
          toolCallId: interrupt.toolCallId,
          toolName: interrupt.toolName,
          input: interrupt.input,
        },
      };
    },
    continueApproval: async ({
      output,
      approvalResponse,
      tools,
      toolExecutionOptions,
    }) => {
      const interrupt = getCodeModeInterrupt(
        output,
        options.continuationSecurity,
      );
      if (
        !isCodeModeApprovalInterrupt(interrupt, options.continuationSecurity)
      ) {
        throw new TypeError(
          'Tool caller output does not contain a code-mode approval interrupt.',
        );
      }
      return await continueCodeModeApproval({
        interrupt,
        approvalResponse,
        tools: tools as CodeModeToolSet,
        options,
        toolExecutionOptions,
      });
    },
  });
}
