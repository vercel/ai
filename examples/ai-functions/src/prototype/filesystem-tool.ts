import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { run } from '../lib/run';
import { LocalSandbox } from './local-sandbox';
import { sandboxShellTool } from './sandbox-shell-tool';

const sandbox = new LocalSandbox({
  rootDirectory: `${process.env.HOME}/Downloads`,
});

const agent = new ToolLoopAgent({
  model: openai('gpt-5.5'),

  instructions:
    `You are a helpful assistant that can run shell commands.` +
    `You are operating in the following sandbox:` +
    sandbox.description,

  tools: {
    shell: sandboxShellTool(),
  },

  toolsContext: {
    shell: {
      sandbox,
    },
  },
});

run(async () => {
  const result = await agent.stream({
    prompt: 'List the files in the directory',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
