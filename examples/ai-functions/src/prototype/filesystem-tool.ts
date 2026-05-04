import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { run } from '../lib/run';
import { LocalSandbox } from './local-sandbox';
import { sandboxShellTool } from './sandbox-shell-tool';
import { z } from 'zod';

const agent = new ToolLoopAgent({
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

run(async () => {
  const sandbox = new LocalSandbox({
    rootDirectory: `${process.env.HOME}/Downloads`,
  });

  const result = await agent.stream({
    prompt: 'List the files in the directory',
    sandbox,
    options: {
      sandboxDescription: sandbox.description,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
