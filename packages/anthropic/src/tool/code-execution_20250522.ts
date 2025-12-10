import {
  createProviderToolFactoryWithOutputSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const codeExecution_20250522OutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.literal('code_execution_result'),
      stdout: z.string(),
      stderr: z.string(),
      return_code: z.number(),
    }),
  ),
);

const codeExecution_20250522InputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      code: z.string(),
    }),
  ),
);

const factory = createProviderToolFactoryWithOutputSchema<
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
  inputSchema: codeExecution_20250522InputSchema,
  outputSchema: codeExecution_20250522OutputSchema,
});

export const codeExecution_20250522 = (
  args: Parameters<typeof factory>[0] = {},
) => {
  return factory(args);
};
