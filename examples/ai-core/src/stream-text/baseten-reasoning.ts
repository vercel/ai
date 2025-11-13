import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const baseten = createOpenAICompatible({
    baseURL: 'https://inference.baseten.co/v1',
    name: 'baseten',
    apiKey: process.env.BASETEN_API_KEY,
  });
  const result = streamText({
    model: baseten('openai/gpt-oss-120b'),
    prompt: 'What is notable about Sonoran food?',
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(`\x1b[34m${part.text}\x1b[0m`);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
