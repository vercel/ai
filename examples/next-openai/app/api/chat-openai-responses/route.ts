import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const prompt = convertToModelMessages(messages);

  const result = streamText({
    model: openai.responses('o3-mini'),
    prompt,
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        reasoningSummary: 'auto',
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
