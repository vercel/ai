import { generateText } from 'ai';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import 'dotenv/config';

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Please set the ANTHROPIC_API_KEY environment variable.');
  }

  const { providerMetadata, text, usage } = await generateText({
    model: 'anthropic/claude-haiku-4.5',
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      gateway: {
        byok: {
          anthropic: [{ apiKey: process.env.ANTHROPIC_API_KEY }],
        },
      } satisfies GatewayProviderOptions,
    },
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
  console.log(JSON.stringify(providerMetadata, null, 2));
}

main().catch(console.error);
