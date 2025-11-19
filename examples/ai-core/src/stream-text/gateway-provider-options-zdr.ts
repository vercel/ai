import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: 'anthropic/claude-sonnet-4',
    prompt: 'Analyze this sensitive business data and provide insights.',
    providerOptions: {
      gateway: {
        zdr: true, // Only use providers with zero data retention
      } satisfies GatewayProviderOptions,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log(
    'Provider metadata:',
    JSON.stringify(await result.providerMetadata, null, 2),
  );
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
