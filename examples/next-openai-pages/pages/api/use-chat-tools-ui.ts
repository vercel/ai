import { openai } from '@ai-sdk/openai';
import { convertToCoreMessages, streamText } from 'ai';
import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  const { messages } = await request.body;

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages: convertToCoreMessages(messages),
    tools: {
      // server-side tool with execute function:
      getWeatherInformation: {
        description: 'show the weather in a given city to the user',
        parameters: z.object({ city: z.string() }),
        execute: async ({}: { city: string }) => {
          return {
            value: 24,
            unit: 'celsius',
            weeklyForecast: [
              { day: 'Mon', value: 24 },
              { day: 'Tue', value: 25 },
              { day: 'Wed', value: 26 },
              { day: 'Thu', value: 27 },
              { day: 'Fri', value: 28 },
              { day: 'Sat', value: 29 },
              { day: 'Sun', value: 30 },
            ],
          };
        },
      },
      // client-side tool that starts user interaction:
      askForConfirmation: {
        description: 'Ask the user for confirmation.',
        parameters: z.object({
          message: z.string().describe('The message to ask for confirmation.'),
        }),
      },
      // client-side tool that is automatically executed on the client:
      getLocation: {
        description:
          'Get the user location. Always ask for confirmation before using this tool.',
        parameters: z.object({}),
      },
    },
  });

  result.pipeAIStreamToResponse(response);
}
