import {
  createProviderDefinedToolFactoryWithOutputSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const codeExecution_20250825OutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.literal('code_execution_result'),
      stdout: z.string(),
      stderr: z.string(),
      return_code: z.number(),
    }),
  ),
);

const codeExecution_20250825InputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      code: z.string(),
    }),
  ),
);

const factory = createProviderDefinedToolFactoryWithOutputSchema<
  {
    /**
     * The code to execute. Supports both Python and Bash commands.
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
