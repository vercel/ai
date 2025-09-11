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

export const codeInterpreterToolFactory = createProviderDefinedToolFactory<
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

export const codeInterpreter = (
  args: Parameters<typeof codeInterpreterToolFactory>[0] = {}, // default
) => {
  return codeInterpreterToolFactory(args);
};
