import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const moonshotai = createOpenAICompatible({
    baseURL: 'https://api.moonshot.ai/v1',
    apiKey: process.env.MOONSHOTAI_API_KEY,
    name: 'moonshotai',
  });
  const result = streamText({
    model: moonshotai('kimi-k2-0711-preview'),
    prompt: 'What is notable about Sonoran food? Answer in a few sentences.',
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
  console.log(
    'Provider metadata:',
    JSON.stringify(await result.providerMetadata, null, 2),
  );
}

main().catch(console.error);
