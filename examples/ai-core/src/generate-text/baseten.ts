import { baseten } from '@ai-sdk/baseten';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  // Using default Model APIs - works with hosted models on Baseten
  const { text, usage } = await generateText({
    model: baseten('deepseek-ai/DeepSeek-V3-0324'),
    prompt: 'What is the meaning of life? Answer in one sentence.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
