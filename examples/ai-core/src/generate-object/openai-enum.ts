import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await generateObject({
    model: openai('gpt-4o-mini', { structuredOutputs: true }),
    output: 'enum',
    enum: ['sunny', 'rainy', 'snowy'],
    prompt: 'Choose a random weather condition.',
  });

  console.log(result.object);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
