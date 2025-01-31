import 'dotenv/config';
import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: perplexity('sonar-pro'),
    prompt: 'Write the biography of Sirius Black from the Harry Potter series.',
    providerOptions: {
      perplexity: {
        return_images: true,
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Metadata:', result.experimental_providerMetadata);
}

main().catch(console.error);
