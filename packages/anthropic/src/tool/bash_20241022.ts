import {
  createProviderDefinedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

const bash_20241022InputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      command: z.string(),
      restart: z.boolean().optional(),
    }),
  ),
);

export const bash_20241022 = createProviderDefinedToolFactory<
  {
    /**
     * The bash command to run. Required unless the tool is being restarted.
     */
    command: string;

    /**
     * Specifying true will restart this tool. Otherwise, leave this unspecified.
     */
    restart?: boolean;
  },
  {}
>({
  id: 'anthropic.bash_20241022',
  name: 'bash',
  inputSchema: bash_20241022InputSchema,
});
