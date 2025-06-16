import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  UIDataTypes,
  UIMessage,
} from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export type UseChatToolsMessage = UIMessage<
  never,
  UIDataTypes,
  {
    getWeatherInformation: {
      input: { city: string };
      output: string;
    };
    askForConfirmation: {
      input: { message: string };
      output: string;
    };
    getLocation: {
      input: {};
      output: string;
    };
  }
>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    // model: anthropic('claude-3-5-sonnet-latest'),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5), // multi-steps for server-side tools
    tools: {
      // server-side tool with execute function:
      getWeatherInformation: tool({
        description: 'show the weather in a given city to the user',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }: { city: string }) => {
          // Add artificial delay of 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));

          const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
          return weatherOptions[
            Math.floor(Math.random() * weatherOptions.length)
          ];
        },

        onInputStart: () => {
          console.log('onInputStart');
        },
        onInputDelta: ({ inputTextDelta }) => {
          console.log('onInputDelta', inputTextDelta);
        },
        onInputAvailable: ({ input }) => {
          console.log('onInputAvailable', input);
        },
      }),
      // client-side tool that starts user interaction:
      askForConfirmation: tool({
        description: 'Ask the user for confirmation.',
        inputSchema: z.object({
          message: z.string().describe('The message to ask for confirmation.'),
        }),
      }),
      // client-side tool that is automatically executed on the client:
      getLocation: tool({
        description:
          'Get the user location. Always ask for confirmation before using this tool.',
        inputSchema: z.object({}),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
