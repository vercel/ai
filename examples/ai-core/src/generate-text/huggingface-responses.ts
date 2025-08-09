import { huggingface } from '@ai-sdk/huggingface';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: huggingface.responses('moonshotai/Kimi-K2-Instruct'),
    prompt: 'Tell me a three sentence bedtime story about a unicorn.',
  });

  console.log(result.text);
}

main().catch(console.error);
