import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { sandboxShellTool } from '../../tools/sandbox-shell-tool';
import { sandboxReadFileTool } from '../../tools/sandbox-read-file-tool';

export const sandboxAgent = new ToolLoopAgent({
  model: openai('gpt-5.5'),

  tools: {
    shell: sandboxShellTool(),
    readFile: sandboxReadFileTool(),
  },

  prepareCall: ({ sandbox, ...rest }) => ({
    ...rest,
    instructions:
      `You are a helpful assistant that can run shell commands.\n` +
      `You are operating in the following sandbox: ${sandbox?.description}`,
  }),
});
