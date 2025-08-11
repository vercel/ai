import 'dotenv/config';
import { streamText } from 'ai';
import { aimlapi } from '@ai-ml.api/aimlapi-vercel-ai';


async function main() {
  const result = streamText({
    model: aimlapi('gpt-4o'),
    system: 'You are a friendly assistant!',
    prompt: 'Why is the sky blue?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
