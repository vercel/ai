import {
  google,
  type GoogleLanguageModelInteractionsOptions,
} from '@ai-sdk/google';
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
    model: google.interactions('gemini-3.1-flash-image-preview'),
    messages: await convertToModelMessages(messages),
    reasoning: 'high',
    providerOptions: {
      google: {
        // This unauthenticated example sends full history instead of resuming
        // stored interactions using IDs supplied by the client.
        store: false,
        responseModalities: ['text', 'image'],
        thinkingSummaries: 'auto',
      } satisfies GoogleLanguageModelInteractionsOptions,
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
