import { mistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage } = await generateText({
    model: mistral('magistral-medium-2506'),
    prompt:
      'Solve this step by step: If a train travels 60 mph for 2 hours, how far does it go?',
    maxOutputTokens: 500,
  });

  console.log('Mistral reasoning model returns raw text with <think> tags:');
  console.log('(Use extract reasoning middleware to parse these if needed)');
  console.log();
  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
