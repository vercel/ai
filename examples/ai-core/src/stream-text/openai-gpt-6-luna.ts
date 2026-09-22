import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-6-luna'),
    prompt: 'Describe a new holiday in one sentence.',
    maxOutputTokens: 128,
    maxRetries: 0,
    providerOptions: { openai: { reasoningEffort: 'none' } },
  });

  for await (const text of result.textStream) {
    process.stdout.write(text);
  }
  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
