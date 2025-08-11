import 'dotenv/config';
import { generateText } from 'ai';
import { aimlapi } from '@ai-ml.api/aimlapi-vercel-ai';

async function main() {
  const { text } = await generateText({
    model: aimlapi('gpt-4o'),
    system: 'You are a friendly assistant!',
    prompt: 'Why is the sky blue?',
  });

  console.log(text);
}

main().catch(console.error);
