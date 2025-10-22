import { z } from 'zod/v4';

export const anthropicSourceExecutionFileProviderMetadataSchema = z.object({
  anthropic: z.object({
    tool_use_id: z.string(),
    content: z.discriminatedUnion('type', [
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
    ]),
  }),
});

export type AnthropicSourceExecutionFileProviderMetadataSchema = z.infer<
  typeof anthropicSourceExecutionFileProviderMetadataSchema
>;
