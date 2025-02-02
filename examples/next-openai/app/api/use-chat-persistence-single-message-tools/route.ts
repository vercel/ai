import { openai } from '@ai-sdk/openai';
import { loadChat, saveChat } from '@util/chat-store';
import {
  appendClientMessage,
  appendResponseMessages,
  createDataStreamResponse,
  createIdGenerator,
  streamText,
  tool,
} from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

let count = 0;

export async function POST(req: Request) {
  // get the last message from the client:
  const { message, id } = await req.json();

  // load the previous messages from the server:
  const previousMessages = await loadChat(id);

  // append the new message to the previous messages:
  const messages = appendClientMessage({
    messages: previousMessages,
    message,
  });

  // immediately start streaming (solves RAG issues with status, etc.)
  return createDataStreamResponse({
    execute: dataStream => {
      dataStream.writeMessageAnnotation({
        start: 'start',
        count: count++,
      });

      const result = streamText({
        model: openai('gpt-4o'),
        messages,
        toolCallStreaming: true,
        maxSteps: 5, // multi-steps for server-side tools
        tools: {
          // server-side tool with execute function:
          getWeatherInformation: tool({
            description: 'show the weather in a given city to the user',
            parameters: z.object({ city: z.string() }),
            execute: async ({ city }: { city: string }) => {
              // Add artificial delay of 2 seconds
              await new Promise(resolve => setTimeout(resolve, 2000));

              const weatherOptions = [
                'sunny',
                'cloudy',
                'rainy',
                'snowy',
                'windy',
              ];

              const weather =
                weatherOptions[
                  Math.floor(Math.random() * weatherOptions.length)
                ];

              dataStream.writeMessageAnnotation({
                city,
                weather,
              });

              return weather;
            },
          }),
          // client-side tool that starts user interaction:
          askForConfirmation: tool({
            description: 'Ask the user for confirmation.',
            parameters: z.object({
              message: z
                .string()
                .describe('The message to ask for confirmation.'),
            }),
          }),
          // client-side tool that is automatically executed on the client:
          getLocation: tool({
            description:
              'Get the user location. Always ask for confirmation before using this tool.',
            parameters: z.object({}),
          }),
        },
        // id format for server-side messages:
        experimental_generateMessageId: createIdGenerator({
          prefix: 'msgs',
          size: 16,
        }),
        async onFinish({ response }) {
          await saveChat({
            id,
            messages: appendResponseMessages({
              messages,
              responseMessages: response.messages,
            }),
          });
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: error => {
      // Error messages are masked by default for security reasons.
      // If you want to expose the error message to the client, you can do so here:
      return error instanceof Error ? error.message : String(error);
    },
  });
}
