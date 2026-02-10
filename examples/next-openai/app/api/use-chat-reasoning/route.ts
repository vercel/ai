import { google } from '@ai-sdk/google';
import { convertToModelMessages, streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google('snowball'),
    messages: await convertToModelMessages(messages),
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: 'medium',
        },
      },
    },
    onFinish: ({ request }) => {
      console.dir(request.body, { depth: null });
    },
  });

  return result.toUIMessageStreamResponse();
}
