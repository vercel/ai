import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const prompt = 'Santa Claus driving a Cadillac';
  const result = await generateImage({
    model: openai.image('gpt-image-1-mini'),
    prompt,
  });

  // @ts-expect-error
  const revisedPrompt = result.providerMetadata.openai.images[0]?.revisedPrompt;

  console.log({
    prompt,
    revisedPrompt,
    usage: result.usage,
  });

  await presentImages([result.image]);
}

main().catch(console.error);
