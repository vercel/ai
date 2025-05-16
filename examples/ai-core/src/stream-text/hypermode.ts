import { hypermode } from '@ai-sdk/hypermode';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: hypermode('meta-llama/llama-4-scout-17b-16e-instruct'),
    maxTokens: 512,
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
