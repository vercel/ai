import { openai } from '@ai-sdk/openai';
import { loadChat, saveChat } from '@util/chat-store';
import {
  appendClientMessage,
  appendResponseMessages,
  createIdGenerator,
  streamText,
  tool,
} from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

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

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    toolCallStreaming: true,
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

  return result.toDataStreamResponse();
}
