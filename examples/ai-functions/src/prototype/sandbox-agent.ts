import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { z } from 'zod';
import { sandboxShellTool } from './sandbox-shell-tool';

export const sandboxAgent = new ToolLoopAgent({
  model: openai('gpt-5.5'),

  instructions: `You are a helpful assistant that can run shell commands.`,

  tools: {
    shell: sandboxShellTool(),
  },

  callOptionsSchema: z.object({
    sandboxDescription: z.string(),
  }),

  prepareCall: ({ options, ...rest }) => ({
    ...rest,
    instructions:
      `${rest.instructions}` +
      `You are operating in the following sandbox: ${options.sandboxDescription}`,
  }),
});
