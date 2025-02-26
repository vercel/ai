import { perplexity } from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: perplexity('sonar-pro'),
    prompt:
      'Tell me about the earliest cave drawings known and include images.',
    providerOptions: {
      perplexity: {
        return_images: true,
      },
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Metadata:',
    JSON.stringify(await result.providerMetadata, null, 2),
  );
}

main().catch(console.error);
