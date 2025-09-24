import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  InferUITools,
  stepCountIs,
  streamText,
  tool,
  UIDataTypes,
  UIMessage,
} from 'ai';
import z from 'zod';

export const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  // location below is inferred to be a string:
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

const tools = { weatherTool } as const;

export type ReasoningToolsMessage = UIMessage<
  never, // could define metadata here
  UIDataTypes, // could define data parts here
  InferUITools<typeof tools>
>;

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  console.log(JSON.stringify(messages, null, 2));

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    messages: convertToModelMessages(messages),
    tools,
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 12000,
        },
      } satisfies AnthropicProviderOptions,
    },
    stopWhen: stepCountIs(5)
  });

  return result.toUIMessageStreamResponse();
}
