import { hypermode } from '@ai-sdk/hypermode';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: hypermode('meta-llama/llama-4-scout-17b-16e-instruct'),
    maxTokens: 512,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
