import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  InferUITools,
  stepCountIs,
  streamText,
  tool,
  UIDataTypes,
  UIMessage,
} from 'ai';
import { z } from 'zod/v4';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const getWeatherInformationTool = tool({
  description: 'show the weather in a given city to the user',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }: { city: string }, { messages }) => {
    // count the number of assistant messages. throw error if 2 or less
    const assistantMessageCount = messages.filter(
      message => message.role === 'assistant',
    ).length;

    if (assistantMessageCount <= 2) {
      throw new Error('could not get weather information');
    }

    // Add artificial delay of 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
    return weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
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
});

const askForConfirmationTool = tool({
  description: 'Ask the user for confirmation.',
  inputSchema: z.object({
    message: z.string().describe('The message to ask for confirmation.'),
  }),
  outputSchema: z.string(),
});

const getLocationTool = tool({
  description:
    'Get the user location. Always ask for confirmation before using this tool.',
  inputSchema: z.object({}),
  outputSchema: z.string(),
});

const tools = {
  // server-side tool with execute function:
  getWeatherInformation: getWeatherInformationTool,
  // client-side tool that starts user interaction:
  askForConfirmation: askForConfirmationTool,
  // client-side tool that is automatically executed on the client:
  getLocation: getLocationTool,
} as const;

export type UseChatToolsMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5), // multi-steps for server-side tools
    tools,
  });

  return result.toUIMessageStreamResponse({
    //  originalMessages: messages, //add if you want to have correct ids
    onFinish: options => {
      console.log('onFinish', options);
    },
  });
}
