import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { openai } from '@ai-sdk/openai';
import type {
  InferUITools,
  ToolSet,
  UIDataTypes,
  UIMessage} from 'ai';
import {
  convertToModelMessages,
  streamText,
  validateUIMessages,
} from 'ai';

const tools = {
  code_interpreter: openai.tools.codeInterpreter(),
} satisfies ToolSet;

export type OpenAICodeInterpreterMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: openai('gpt-5-nano'),
    tools,
    messages: convertToModelMessages(uiMessages),
    onStepFinish: ({ request }) => {
      console.log(JSON.stringify(request.body, null, 2));
    },
    providerOptions: {
      openai: {
        store: false,
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  return result.toUIMessageStreamResponse();
}
