import 'dotenv/config';
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: xai('grok-3-beta'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
