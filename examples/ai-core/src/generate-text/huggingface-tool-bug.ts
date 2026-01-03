import { huggingface } from '@ai-sdk/huggingface';
import { stepCountIs, streamText, tool } from 'ai';
import z from 'zod';
import 'dotenv/config';

async function main() {
  const { textStream } = streamText({
    model: huggingface('deepseek-ai/DeepSeek-V3-0324'),
    prompt: 'What is the weather in Montevideo, Uruguay?',
    stopWhen: stepCountIs(5),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    onError({ error }) {
      console.error(error);
    },
  });

  for await (const textPart of textStream) {
    process.stdout.write(textPart);
  }
  console.log('\nDone');
}

main().catch(console.error);
