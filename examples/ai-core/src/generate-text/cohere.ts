import { cohere } from '@ai-sdk/cohere';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage } = await generateText({
    model: cohere('command-a-03-2025'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
