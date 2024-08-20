import { createOpenAI } from '@ai-sdk/openai';
import { convertToCoreMessages, streamText } from 'ai';
import { z } from 'zod';
import { defineEventHandler, readBody, createError } from 'h3';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export default defineEventHandler(async (event) => {
  // Check for API key
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({
    apiKey: apiKey,
  });

  const { messages } = await readBody(event);

  try {
    const result = await streamText({
      model: openai('gpt-4o'),
      messages: convertToCoreMessages(messages),
      experimental_toolCallStreaming: true,
      tools: {
        // server-side tool with execute function:
        getWeatherInformation: {
          description: 'show the weather in a given city to the user',
          parameters: z.object({ city: z.string() }),
          execute: async ({}: { city: string }) => {
            const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
            return weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
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

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Error in chat API:', error);
    throw createError({
      statusCode: 500,
      message: 'An error occurred while processing the chat request',
    });
  }
});
