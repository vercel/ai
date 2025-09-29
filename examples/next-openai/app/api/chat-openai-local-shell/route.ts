import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { Sandbox } from '@vercel/sandbox';
import {
  convertToModelMessages,
  InferUITools,
  stepCountIs,
  streamText,
  ToolSet,
  UIDataTypes,
  UIMessage,
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

const tools = {
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
} satisfies ToolSet;

export type OpenAILocalShellMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: openai('gpt-5-codex'),
    tools,
    stopWhen: stepCountIs(10),
    messages: convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse();
}
