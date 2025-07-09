import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = streamText({
    model: openai('gpt-4o'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({ location: z.string() }),
        execute: async () => ({
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    stopWhen: stepCountIs(5),
    onFinish({ steps }) {
      console.log(JSON.stringify(steps, null, 2));
    },
    prompt: 'What is the current weather in San Francisco?',
  });

  // consume the text stream
  for await (const textPart of result.textStream) {
  }
}

main().catch(console.error);
