import { createProviderDefinedToolFactoryWithOutputSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const codeExecution_20250522OutputSchema = z.object({
  type: z.literal('code_execution_result'),
  stdout: z.string(),
  stderr: z.string(),
  return_code: z.number(),
});

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  {
    /**
     * The Python code to execute.
     */
    code: string;
  },
  {
    type: 'code_execution_result';
    stdout: string;
    stderr: string;
    return_code: number;
  },
  {}
>({
  id: 'anthropic.code_execution_20250522',
  name: 'code_execution',
  inputSchema: z.object({
    code: z.string(),
  }),
  outputSchema: codeExecution_20250522OutputSchema,
});

export const codeExecution_20250522 = (
  args: Parameters<typeof factory>[0] = {},
) => {
  return factory(args);
};
