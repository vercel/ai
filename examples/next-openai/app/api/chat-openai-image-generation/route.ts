import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  InferUITools,
  streamText,
  ToolSet,
  UIDataTypes,
  UIMessage,
  validateUIMessages,
} from 'ai';

const tools = {
  image_generation: openai.tools.imageGeneration(),
} satisfies ToolSet;

export type OpenAIImageGenerationMessage = UIMessage<
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
      // openai: {
      //   store: false,
      //   include: ['reasoning.encrypted_content'],
      // } satisfies OpenAIResponsesProviderOptions,
    },
  });

  return result.toUIMessageStreamResponse();
}
