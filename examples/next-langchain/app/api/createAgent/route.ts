import { z } from 'zod';

import { createUIMessageStreamResponse, UIMessage } from 'ai';
import { NextResponse } from 'next/server';

import { createAgent, tool } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';

/**
 * Allow streaming responses up to 30 seconds
 */
export const maxDuration = 30;

/**
 * The weather tool
 * @param city - The city to get weather for
 * @returns The weather in the city
 */
const weatherTool = tool(
  async ({ city }: { city: string }) => {
    // Simulated weather data
    const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const temperature = Math.floor(Math.random() * 30) + 50;

    return `Weather in ${city}: ${condition}, ${temperature}°F`;
  },
  {
    name: 'get_weather',
    description: 'Get the current weather in a location',
    schema: z.object({
      city: z.string().describe('The city to get weather for'),
    }),
  },
);

/**
 * The model to use for the agent
 */
const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
});

/**
 * The LangChain agent with the weather tool
 */
const agent = createAgent({
  model,
  tools: [weatherTool],
  systemPrompt:
    'You are a helpful weather assistant. When asked about weather, use the weather tool to get current conditions.',
});

/**
 * The API route for the LangChain agent
 * @param req - The request object
 * @returns The response from the API
 */
export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    /**
     * Convert AI SDK UIMessages to LangChain messages
     */
    const langchainMessages = await toBaseMessages(messages);

    /**
     * Stream from the LangChain agent
     */
    const stream = await agent.stream(
      { messages: langchainMessages },
      { streamMode: ['values', 'messages'] },
    );

    /**
     * Convert the LangChain stream to UI message stream
     */
    return createUIMessageStreamResponse({
      stream: toUIMessageStream(stream as unknown as ReadableStream),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
