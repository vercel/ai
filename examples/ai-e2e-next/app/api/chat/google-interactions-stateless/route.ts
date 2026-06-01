import {
  google,
  type GoogleLanguageModelInteractionsOptions,
} from '@ai-sdk/google';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google.interactions('gemini-3.1-flash-image-preview'),
    messages: await convertToModelMessages(messages),
    reasoning: 'high',
    providerOptions: {
      google: {
        responseModalities: ['text', 'image'],
        thinkingSummaries: 'auto',
        store: false,
      } satisfies GoogleLanguageModelInteractionsOptions,
    },
  });

  return result.toUIMessageStreamResponse();
}
