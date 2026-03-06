import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { streamText, convertToModelMessages } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google('gemini-3.1-flash-image-preview'),
    messages: await convertToModelMessages(messages),
    providerOptions: {
      google: {
        responseModalities: ['TEXT', 'IMAGE'],
        thinkingConfig: {
          thinkingLevel: 'high',
        },
      } satisfies GoogleLanguageModelOptions,
    },
    includeRawChunks: true,
  });

  return result.toUIMessageStreamResponse();
}
