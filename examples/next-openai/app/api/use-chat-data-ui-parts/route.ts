import { openai } from '@ai-sdk/openai';
import { delay } from '@ai-sdk/provider-utils';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const result = streamText({
        model: openai('gpt-4o'),
        stopWhen: stepCountIs(2),
        tools: {
          weather: {
            description: 'Get the weather in a city',
            inputSchema: z.object({
              city: z.string(),
            }),
            execute: async ({ city }, { toolCallId }) => {
              // update display
              writer.write({
                type: 'data-weather',
                id: toolCallId,
                data: { city, status: 'loading' },
              });

              await delay(2000); // fake delay
              const weather = 'sunny';

              // update display
              writer.write({
                type: 'data-weather',
                id: toolCallId,
                data: { city, weather, status: 'success' },
              });

              // for LLM roundtrip
              return { city, weather };
            },
          },
        },
        messages: convertToModelMessages(messages),
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
