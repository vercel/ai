import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await streamText({
    model: anthropic('claude-3-haiku-20240307'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
