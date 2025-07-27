import { fireworks } from '@ai-sdk/fireworks';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: fireworks('accounts/fireworks/models/deepseek-v3'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Usage:', result.usage);
}

main().catch(console.error);
