import {
  createProviderDefinedToolFactoryWithOutputSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const codeExecution_20260120OutputSchema = lazySchema(() =>
  zodSchema(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('code_execution_result'),
        stdout: z.string(),
        stderr: z.string(),
        return_code: z.number(),
        content: z
          .array(
            z.object({
              type: z.literal('code_execution_output'),
              file_id: z.string(),
            }),
          )
          .optional()
          .default([]),
      }),
      z.object({
        type: z.literal('encrypted_code_execution_result'),
        encrypted_stdout: z.string(),
        stderr: z.string(),
        return_code: z.number(),
        content: z
          .array(
            z.object({
              type: z.literal('code_execution_output'),
              file_id: z.string(),
            }),
          )
          .optional()
          .default([]),
      }),
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

export const codeExecution_20260120InputSchema = lazySchema(() =>
  zodSchema(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('programmatic-tool-call'),
        code: z.string(),
      }),
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

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  | {
      type: 'programmatic-tool-call';
      code: string;
    }
  | {
      type: 'bash_code_execution';
      command: string;
    }
  | {
      type: 'text_editor_code_execution';
      command: 'view';
      path: string;
    }
  | {
      type: 'text_editor_code_execution';
      command: 'create';
      path: string;
      file_text?: string | null;
    }
  | {
      type: 'text_editor_code_execution';
      command: 'str_replace';
      path: string;
      old_str: string;
      new_str: string;
    },
  | {
      type: 'code_execution_result';
      stdout: string;
      stderr: string;
      return_code: number;
      content: Array<{ type: 'code_execution_output'; file_id: string }>;
    }
  | {
      type: 'encrypted_code_execution_result';
      encrypted_stdout: string;
      stderr: string;
      return_code: number;
      content: Array<{ type: 'code_execution_output'; file_id: string }>;
    }
  | {
      type: 'bash_code_execution_result';
      content: Array<{
        type: 'bash_code_execution_output';
        file_id: string;
      }>;
      stdout: string;
      stderr: string;
      return_code: number;
    }
  | {
      type: 'bash_code_execution_tool_result_error';
      error_code: string;
    }
  | {
      type: 'text_editor_code_execution_tool_result_error';
      error_code: string;
    }
  | {
      type: 'text_editor_code_execution_view_result';
      content: string;
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
  id: 'anthropic.code_execution_20260120',
  name: 'code_execution',
  inputSchema: codeExecution_20260120InputSchema,
  outputSchema: codeExecution_20260120OutputSchema,
});

export const codeExecution_20260120 = (
  args: Parameters<typeof factory>[0] = {},
) => {
  return factory(args);
};
