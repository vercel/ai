import { isLocalDevelopmentRequest } from '../code-execution-files/is-local-development-request';
import { openai } from '@ai-sdk/openai';
import { Sandbox } from '@vercel/sandbox';
import {
  type Experimental_InferAgentUIMessage as InferAgentUIMessage,
  Experimental_Agent as Agent,
  stepCountIs,
  validateUIMessages,
} from 'ai';

// This sandbox is shared across local demo chats. The API route enforces local
// development only; deployed use requires authentication and sandbox ownership.
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
  if (!isLocalDevelopmentRequest(req)) {
    return new Response('Local shell is only available in local development.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const { messages } = await req.json();

  return sandboxAgent.respond({
    messages: await validateUIMessages({ messages }),
  });
}
