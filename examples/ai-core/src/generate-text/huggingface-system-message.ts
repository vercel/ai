import { huggingface } from '@ai-sdk/huggingface';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
    system:
      'You are a helpful assistant that always responds in a pirate accent.',
    prompt: 'Tell me about the weather today.',
  });

  console.log(result.text);
  console.log();
  console.log('Usage:', result.usage);
}

main().catch(console.error);
