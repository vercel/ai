import { xai } from '@ai-sdk/xai';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: xai('grok-4-fast-reasoning'),
    schema: z.object({
      name: z.string(),
      age: z.number().optional(),
      occupation: z.string().optional(),
    }),
    system: 'identify the person information from the following text',
    messages: [
      {
        role: 'user',
        content:
          'my name is john doe, i am 35 years old and work as a software engineer',
      },
    ],
  });

  console.log('extracted person:', result.object);
  console.log();
  console.log('token usage:', result.usage);
  console.log('finish reason:', result.finishReason);
}

main().catch(console.error);
