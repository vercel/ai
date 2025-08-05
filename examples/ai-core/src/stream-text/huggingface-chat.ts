import { huggingface } from '@ai-sdk/huggingface';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: huggingface('Qwen/Qwen3-Coder-480B-A35B-Instruct'),
    prompt: 'Write a short poem about recursion.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log();

  const usage = await result.usage;
  console.log('Token usage:', usage);
}

main().catch(console.error);
