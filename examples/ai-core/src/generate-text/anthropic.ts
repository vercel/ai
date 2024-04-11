import { experimental_generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await experimental_generateText({
    model: anthropic.messages('claude-3-haiku-20240307'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
