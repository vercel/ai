import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: 'anthropic/claude-4-sonnet',
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      gateway: {
        order: ['bedrock', 'anthropic'],
      },
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Provider metadata:', await result.providerMetadata);
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
