import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateObject({
    model: openai('gpt-4o-2024-08-06'),
    output: 'no-schema',
    prompt: 'Generate a lasagna recipe.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
