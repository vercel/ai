import { openai } from '@ai-sdk/openai';
import { StreamData, StreamingTextResponse, streamText } from 'ai';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  // Call the language model
  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
    tools: {
      weather: {
        description: 'show the weather in a given city to the user',
        parameters: z.object({ city: z.string() }),
        execute: async ({ city }: { city: string }) => {
          // return fake weather data:
          return { weather: 'sunny' };
        },
      },
    },
  });

  const streamData = new StreamData();

  // async: process tool calls and append them to the stream data
  (async () => {
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'tool-result') {
          // only weather tool, so it's fully typed:
          streamData.append({
            city: part.args.city,
            weather: part.result.weather,
          });
        }
      }
    } finally {
      streamData.close();
    }
  })().catch(console.error);

  // Respond with the stream
  return new StreamingTextResponse(result.toAIStream(), undefined, streamData);
}
