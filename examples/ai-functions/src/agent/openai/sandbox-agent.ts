import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { sandboxShellTool } from '../../tools/sandbox-shell-tool';

export const sandboxAgent = new ToolLoopAgent({
  model: openai('gpt-5.5'),

  tools: {
    shell: sandboxShellTool(),
  },

  prepareCall: ({ sandbox, ...rest }) => ({
    ...rest,
    instructions:
      `You are a helpful assistant that can run shell commands.\n` +
      `You are operating in the following sandbox: ${sandbox?.description}`,
  }),
});
