import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { sandboxShellTool } from './sandbox-shell-tool';

export const sandboxAgent = new ToolLoopAgent({
  model: openai('gpt-5.5'),

  instructions: `You are a helpful assistant that can run shell commands.`,

  tools: {
    shell: sandboxShellTool(),
  },

  prepareCall: ({ sandbox, ...rest }) => ({
    ...rest,
    instructions:
      `${rest.instructions}` +
      `You are operating in the following sandbox: ${sandbox?.description}`,
  }),
});
