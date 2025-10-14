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
        content: z.array(
          z.object({
            type: z.literal('bash_code_execution_output'),
            fileId: z.string(),
          }),
        ),
        stdout: z.string(),
        stderr: z.string(),
        returnCode: z.number(),
      }),
      z.object({
        type: z.literal('bash_code_execution_tool_result_error'),
        errorCode: z.string(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_tool_result_error'),
        errorCode: z.string(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_view_result'),
        content: z.string(),
        fileType: z.string(),
        numLines: z.number().nullable(),
        startLine: z.number().nullable(),
        totalLines: z.number().nullable(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_create_result'),
        isFileUpdate: z.boolean(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_str_replace_result'),
        lines: z.array(z.string()).nullable(),
        newLines: z.number().nullable(),
        newStart: z.number().nullable(),
        oldLines: z.number().nullable(),
        oldStart: z.number().nullable(),
      }),
    ]),
  ),
);

export const codeExecution_20250825InputSchema = lazySchema(() =>
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
       * Available options: invalid_tool_input, unavailable, too_many_requests,
       * execution_time_exceeded, output_file_too_large.
       */
      errorCode: string;
    }
  | {
      type: 'text_editor_code_execution_tool_result_error';

      /**
       * Available options: invalid_tool_input, unavailable, too_many_requests,
       * execution_time_exceeded, file_not_found.
       */
      errorCode: string;
    }
  | {
      type: 'text_editor_code_execution_view_result';

      content: string;

      /**
       * The type of the file. Available options: text, image, pdf.
       */
      fileType: string;

      numLines: number | null;
      startLine: number | null;
      totalLines: number | null;
    }
  | {
      type: 'text_editor_code_execution_create_result';

      isFileUpdate: boolean;
    }
  | {
      type: 'text_editor_code_execution_str_replace_result';

      lines: string[] | null;
      newLines: number | null;
      newStart: number | null;
      oldLines: number | null;
      oldStart: number | null;
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
