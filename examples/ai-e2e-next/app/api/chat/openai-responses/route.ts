import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai.responses('gpt-6-luna'),
    messages: await convertToModelMessages(messages),
    reasoning: 'low',
    providerOptions: {
      openai: {
        reasoningSummary: 'auto',
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
