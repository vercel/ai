import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  // split schema support:
  const Person = z.object({ name: z.string() });
  const Team = z.object({
    developers: z.array(Person),
    designers: z.array(Person),
  });

  const result = await generateObject({
    model: google('gemini-exp-1206'),
    schema: Team,
    prompt: 'Generate a fake team of developers and designers.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
