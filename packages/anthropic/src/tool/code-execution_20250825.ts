import {
  createProviderToolFactoryWithOutputSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const codeExecution_20250825OutputSchema = lazySchema(() =>
  zodSchema(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('bash_code_execution_result'),
        content: z.array(
          z.object({
            type: z.literal('bash_code_execution_output'),
            file_id: z.string(),
          }),
        ),
        stdout: z.string(),
        stderr: z.string(),
        return_code: z.number(),
      }),
      z.object({
        type: z.literal('bash_code_execution_tool_result_error'),
        error_code: z.string(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_tool_result_error'),
        error_code: z.string(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_view_result'),
        content: z.string(),
        file_type: z.string(),
        num_lines: z.number().nullable(),
        start_line: z.number().nullable(),
        total_lines: z.number().nullable(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_create_result'),
        is_file_update: z.boolean(),
      }),
      z.object({
        type: z.literal('text_editor_code_execution_str_replace_result'),
        lines: z.array(z.string()).nullable(),
        new_lines: z.number().nullable(),
        new_start: z.number().nullable(),
        old_lines: z.number().nullable(),
        old_start: z.number().nullable(),
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
      z.discriminatedUnion('command', [
        z.object({
          type: z.literal('text_editor_code_execution'),
          command: z.literal('view'),
          path: z.string(),
        }),
        z.object({
          type: z.literal('text_editor_code_execution'),
          command: z.literal('create'),
          path: z.string(),
          file_text: z.string().nullish(),
        }),
        z.object({
          type: z.literal('text_editor_code_execution'),
          command: z.literal('str_replace'),
          path: z.string(),
          old_str: z.string(),
          new_str: z.string(),
        }),
      ]),
    ]),
  ),
);

const factory = createProviderToolFactoryWithOutputSchema<
  | {
      type: 'bash_code_execution';

      /**
       * Shell command to execute.
       */
      command: string;
    }
  | {
      type: 'text_editor_code_execution';
      command: 'view';

      /**
       * The path to the file to view.
       */
      path: string;
    }
  | {
      type: 'text_editor_code_execution';
      command: 'create';

      /**
       * The path to the file to edit.
       */
      path: string;

      /**
       * The text of the file to edit.
       */
      file_text?: string | null;
    }
  | {
      type: 'text_editor_code_execution';
      command: 'str_replace';

      /**
       * The path to the file to edit.
       */
      path: string;

      /**
       * The string to replace.
       */
      old_str: string;

      /**
       * The new string to replace the old string with.
       */
      new_str: string;
    },
  | {
      type: 'bash_code_execution_result';

      /**
       * Output file Id list
       */
      content: Array<{
        type: 'bash_code_execution_output';
        file_id: string;
      }>;

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
      return_code: number;
    }
  | {
      type: 'bash_code_execution_tool_result_error';

      /**
       * Available options: invalid_tool_input, unavailable, too_many_requests,
       * execution_time_exceeded, output_file_too_large.
       */
      error_code: string;
    }
  | {
      type: 'text_editor_code_execution_tool_result_error';

      /**
       * Available options: invalid_tool_input, unavailable, too_many_requests,
       * execution_time_exceeded, file_not_found.
       */
      error_code: string;
    }
  | {
      type: 'text_editor_code_execution_view_result';

      content: string;

      /**
       * The type of the file. Available options: text, image, pdf.
       */
      file_type: string;

      num_lines: number | null;
      start_line: number | null;
      total_lines: number | null;
    }
  | {
      type: 'text_editor_code_execution_create_result';

      is_file_update: boolean;
    }
  | {
      type: 'text_editor_code_execution_str_replace_result';

      lines: string[] | null;
      new_lines: number | null;
      new_start: number | null;
      old_lines: number | null;
      old_start: number | null;
    },
  {
    // no arguments
  }
>({
  id: 'anthropic.code_execution_20250825',
  inputSchema: codeExecution_20250825InputSchema,
  outputSchema: codeExecution_20250825OutputSchema,
});

export const codeExecution_20250825 = (
  args: Parameters<typeof factory>[0] = {},
) => {
  return factory(args);
};
