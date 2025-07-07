import { openai } from '@ai-sdk/openai';
import { Experimental_Agent as Agent, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const agent = new Agent({
    model: openai('gpt-3.5-turbo'),
    system: 'You are a helpful that answers questions about the weather.',
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
      }),
    },
    stopWhen: stepCountIs(5),
  });

  const result = agent.stream({
    prompt: 'What is the weather in Tokyo?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
