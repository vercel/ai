import { huggingface } from '@ai-sdk/huggingface';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
    system: 'You are a knowledgeable chef who loves to share cooking tips and recipes.',
    prompt: 'How do I make the perfect scrambled eggs?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
}

main().catch(console.error);
