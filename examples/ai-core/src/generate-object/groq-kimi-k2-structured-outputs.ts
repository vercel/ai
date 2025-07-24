import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';
import 'dotenv/config';

async function main() {
  const result = await generateObject({
    model: groq('moonshotai/kimi-k2-instruct'),
    schema: z.record(z.unknown()),
    prompt: 'Create a simple pasta recipe.',
    providerOptions: {
      groq: {
        structuredOutputs: true,
      },
    },
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
}

main().catch(console.error);
