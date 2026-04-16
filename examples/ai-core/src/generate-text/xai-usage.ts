import 'dotenv/config';
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: xai('grok-3-mini'),
    prompt: 'Say a single word.',
  });

  console.log('text:', result.text);
  console.log();
  console.log('sdk usage:', JSON.stringify(result.usage, null, 2));
}

main().catch(console.error);
