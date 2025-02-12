import { google } from '@ai-sdk/google';
import { vertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    // model: google('gemini-1.5-pro-latest', { useSearchGrounding: true }),
    model: vertex('gemini-1.5-flash', { useSearchGrounding: true }),
    messages,
    onError(error) {
      console.error(error);
    },
    maxRetries: 0,
  });

  return result.toDataStreamResponse({
    sendSources: true,
  });
}
