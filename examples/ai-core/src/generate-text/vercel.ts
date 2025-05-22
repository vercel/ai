import 'dotenv/config';
import { vercel } from '@ai-sdk/vercel';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: vercel('v0-1.0-md'),
    // prompt: 'Invent a new holiday and describe its traditions.',
    prompt: 'Create a Next.js AI chatbot',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
