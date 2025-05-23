import { createAnthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { fireworks } from '@ai-sdk/fireworks';
import {
  convertToModelMessages,
  extractReasoningMiddleware,
  stepCountIs,
  streamText,
  tool,
  wrapLanguageModel,
} from 'ai';
import { z } from 'zod';

const anthropic = createAnthropic({
  // example fetch wrapper that logs the input to the API call:
  fetch: async (url, options) => {
    console.log('URL', url);
    console.log('Headers', JSON.stringify(options!.headers, null, 2));
    console.log(
      `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`,
    );
    return await fetch(url, options);
  },
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  console.log(JSON.stringify(messages, null, 2));

  const result = streamText({
    model: wrapLanguageModel({
      model: fireworks('accounts/fireworks/models/qwen3-30b-a3b'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    messages: convertToModelMessages(messages),
    toolCallStreaming: true,
    stopWhen: stepCountIs(5), // multi-steps for server-side tools
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

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}
