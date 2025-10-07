import { openai } from '@ai-sdk/openai';
import { Sandbox } from '@vercel/sandbox';
import { Agent, InferAgentUIMessage } from 'ai';

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

export const openaiLocalShellAgent = new Agent({
  model: openai('gpt-5-codex'),
  system: 'You are an agent with access to a shell environment.',
  tools: {
    local_shell: openai.tools.localShell({
      needsApproval: true,
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
});

export type OpenAILocalShellMessage = InferAgentUIMessage<
  typeof openaiLocalShellAgent
>;
