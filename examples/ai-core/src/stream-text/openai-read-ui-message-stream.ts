import { openai } from '@ai-sdk/openai';
import { readUIMessageStream, stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamText({
    model: openai('gpt-4.1-mini'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
        toModelOutput: ({ location, temperature }) => ({
          type: 'text',
          value: `The weather in ${location} is ${temperature} degrees Fahrenheit.`,
        }),
      }),
    },
    stopWhen: stepCountIs(5),
    prompt: 'What is the weather in Tokyo?',
  });

  for await (const uiMessage of readUIMessageStream({
    stream: result.toUIMessageStream(),
  })) {
    console.clear();
    console.log(JSON.stringify(uiMessage, null, 2));
  }
}

main().catch(console.error);
