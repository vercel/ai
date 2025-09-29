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
import z from 'zod';

const contextSchema = z.object({
  sandboxId: z.string().nullable(),
});

const tools = {
  local_shell: openai.tools.localShell({
    execute: async ({ action }, { experimental_context }) => {
      let sandbox: Sandbox | null = null;

      const { success, data } = contextSchema.safeParse(experimental_context);
      if (success && data.sandboxId) {
        sandbox = await Sandbox.get({ sandboxId: data.sandboxId });
        console.log('reusing sandbox:', sandbox.sandboxId);
      } else {
        sandbox = await Sandbox.create();
        // @ts-ignore experimental_context type is unknown
        experimental_context.sandboxId = sandbox.sandboxId;
      }

      try {
        const [cmd, ...args] = action.command;

        const command = await sandbox.runCommand({
          cmd,
          args,
          cwd: action.workingDirectory,
        });

        const output = await command.stdout();

        return { output };
      } catch (error) {
        console.error(error);
        throw error;
      }
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
    experimental_context: {
      sandboxId: null,
    },
    messages: convertToModelMessages(uiMessages),
    onStepFinish: ({ request }) => {
      console.log(JSON.stringify(request.body, null, 2));
    },
    providerOptions: {
      openai: {
        store: false,
        include: ['reasoning.encrypted_content'],
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  return result.toUIMessageStreamResponse();
}
