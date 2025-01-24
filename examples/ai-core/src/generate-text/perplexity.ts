import 'dotenv/config';
import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: perplexity('sonar-pro'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Metadata:', result.experimental_providerMetadata);
}

main().catch(console.error);
