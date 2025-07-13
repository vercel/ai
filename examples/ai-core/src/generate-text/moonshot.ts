import { moonshot } from '@ai-sdk/moonshot';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text } = await generateText({
    model: moonshot('kimi-k2-0711-preview'),
    prompt: 'Count from 1 to 3 and say hello.',
    temperature: 0.6, // Recommended temperature for Kimi K2
  });

  console.log(text);
}

main().catch(console.error);
