import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-4o-mini'),
    maxOutputTokens: 100,
    system: 'You are a helpful assistant.',
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log();
  console.log((await result.request).body);
}

main().catch(console.error);
