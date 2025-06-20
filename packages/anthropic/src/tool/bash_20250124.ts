import { createProviderDefinedClientToolFactory } from '@ai-sdk/provider-utils';
import z from 'zod/v4';

export const bash_20250124 = createProviderDefinedClientToolFactory<
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
  id: 'anthropic.bashTool_20250124',
  inputSchema: z.object({
    command: z.string(),
    restart: z.boolean().optional(),
  }),
});
