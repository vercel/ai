import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    experimental_toolCallStreaming: true,
    maxSteps: 5, // multi-steps for server-side tools
    tools: {
      // server-side tool with execute function:
      getWeatherInformation: tool({
        description: 'show the weather in a given city to the user',
        parameters: z.object({ city: z.string() }),
        execute: async ({}: { city: string }) => {
          // Add artificial delay of 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));

          const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
          return weatherOptions[
            Math.floor(Math.random() * weatherOptions.length)
          ];
        },
      }),
      // client-side tool that starts user interaction:
      askForConfirmation: tool({
        description: 'Ask the user for confirmation.',
        parameters: z.object({
          message: z.string().describe('The message to ask for confirmation.'),
        }),
      }),
      // client-side tool that is automatically executed on the client:
      getLocation: tool({
        description:
          'Get the user location. Always ask for confirmation before using this tool.',
        parameters: z.object({}),
      }),
    },
  });

  return result.toDataStreamResponse();
}
