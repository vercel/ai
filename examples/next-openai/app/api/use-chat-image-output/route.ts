import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google('gemini-2.0-flash-exp'),
    providerOptions: {
      google: { responseModalities: ['TEXT', 'IMAGE'] },
    },
    messages,
  });

  return result.toDataStreamResponse();
}
