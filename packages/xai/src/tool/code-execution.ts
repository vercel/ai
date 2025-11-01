import { createProviderDefinedToolFactoryWithOutputSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const codeExecutionOutputSchema = z.object({
  output: z.string().describe('the output of the code execution'),
  error: z.string().optional().describe('any error that occurred'),
});

const codeExecutionToolFactory =
  createProviderDefinedToolFactoryWithOutputSchema({
    id: 'xai.code_execution',
    name: 'code_execution',
    inputSchema: z.object({}).describe('no input parameters'),
    outputSchema: codeExecutionOutputSchema,
  });

export const codeExecution = (
  args: Parameters<typeof codeExecutionToolFactory>[0] = {},
) => codeExecutionToolFactory(args);
