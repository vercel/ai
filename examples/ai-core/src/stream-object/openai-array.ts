import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { elementStream: destinations } = streamObject({
    model: openai('gpt-4o'),
    output: 'array',
    schema: z.object({
      city: z.string(),
      country: z.string(),
      description: z.string(),
      attractions: z.array(z.string()).describe('List of major attractions.'),
    }),
    prompt: 'What are the top 5 cities for short vacations in Europe?',
  });

  for await (const destination of destinations) {
    console.log(destination); // destination is a complete array element
  }
}

main().catch(console.error);
