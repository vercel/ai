import { huggingface } from '@ai-sdk/huggingface';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
    prompt: 'List the planets in our solar system: 1. Mercury 2. Venus 3.',
    stopSequences: ['5.', 'Jupiter'],
  });

  console.log('Response (stopped before listing Jupiter):');
  console.log(result.text);
  console.log();
  console.log('Usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
