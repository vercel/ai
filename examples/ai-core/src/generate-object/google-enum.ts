import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateObject({
    model: google('gemini-1.5-pro-latest'),
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
