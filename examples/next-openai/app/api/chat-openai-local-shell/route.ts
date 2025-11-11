import { openai } from '@ai-sdk/openai';
import { Sandbox } from '@vercel/sandbox';
import {
  Experimental_Agent as Agent,
  Experimental_InferAgentUIMessage as InferAgentUIMessage,
  stepCountIs,
  validateUIMessages,
} from 'ai';

// warning: this is a demo sandbox that is shared across chats on localhost
let globalSandboxId: string | null = null;
async function getSandbox(): Promise<Sandbox> {
  if (globalSandboxId) {
    return await Sandbox.get({ sandboxId: globalSandboxId });
  }
  const sandbox = await Sandbox.create();
  globalSandboxId = sandbox.sandboxId;
  return sandbox;
}

const sandboxAgent = new Agent({
  model: openai('gpt-5-codex'),
  system: 'You are a helpful assistant.',
  tools: {
    local_shell: openai.tools.localShell({
      execute: async ({ action }) => {
        const [cmd, ...args] = action.command;

        const sandbox = await getSandbox();
        const command = await sandbox.runCommand({
          cmd,
          args,
          cwd: action.workingDirectory,
        });

        return { output: await command.stdout() };
      },
    }),
  },
  stopWhen: stepCountIs(10),
});

export type OpenAILocalShellMessage = InferAgentUIMessage<typeof sandboxAgent>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  return sandboxAgent.respond({
    messages: await validateUIMessages({ messages }),
  });
}
