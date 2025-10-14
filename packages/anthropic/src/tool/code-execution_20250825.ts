import {
  createProviderDefinedToolFactoryWithOutputSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const codeExecution_20250825OutputSchema = lazySchema(() =>
  zodSchema(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('bash_code_execution_tool_result'),
        content: z.object({
          type: z.literal('bash_code_execution_output'),
          fileId: z.string(),
        }),
        stdout: z.string(),
        stderr: z.string(),
        returnCode: z.number(),
      }),
      z.object({
        type: z.literal('bash_code_execution_tool_result_error'),
        errorCode: z.string(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_result'),
        // TODO additional fields
      }),
    ]),
  ),
);

const codeExecution_20250825InputSchema = lazySchema(() =>
  zodSchema(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('bash_code_execution'),
        command: z.string(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution'),
        // TODO what is supported here?
      }),
    ]),
  ),
);

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  | {
      type: 'bash_code_execution';

      /**
       * Shell command to execute.
       */
      command: string;
    }
  | {
      type: 'text_editor_code_execution';
    },
  | {
      type: 'bash_code_execution_tool_result';

      /**
       * Output from successful execution
       */
      stdout: string;

      /**
       * Error messages if execution fails
       */
      stderr: string;

      /**
       * 0 for success, non-zero for failure
       */
      returnCode: number;
    }
  | {
      type: 'bash_code_execution_tool_result_error';

      /**
       * Error code
       */
      errorCode: string;
    }
  | {
      type: 'text_editor_code_execution_result';
      // TODO
    },
  {
    // no arguments
  }
>({
  id: 'anthropic.code_execution_20250825',
  name: 'code_execution',
  inputSchema: codeExecution_20250825InputSchema,
  outputSchema: codeExecution_20250825OutputSchema,
});

export const codeExecution_20250825 = (
  args: Parameters<typeof factory>[0] = {},
) => {
  return factory(args);
};
