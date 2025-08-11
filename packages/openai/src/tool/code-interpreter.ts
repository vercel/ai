import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const codeInterpreterArgsSchema = z.object({
  container: z
    .union([
      z.string(),
      z.object({
        fileIds: z.array(z.string()).optional(),
      }),
    ])
    .optional(),
});

export const codeInterpreter = createProviderDefinedToolFactory<
  {},
  {
    /**
     * The code interpreter container.
     * Can be a container ID
     * or an object that specifies uploaded file IDs to make available to your code.
     */
    container?: string | { fileIds?: string[] };
  }
>({
  id: 'openai.code_interpreter',
  name: 'code_interpreter',
  inputSchema: z.object({}),
});
