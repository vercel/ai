import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const prompt = 'Santa Claus driving a Cadillac';
  const result = await generateImage({
    model: openai.image('dall-e-3'),
    prompt,
  });

  const revisedPrompt = result.providerMetadata[0]?.openai.revisedPrompt;

  console.log(`PROMPT`);
  console.log(prompt);

  if (revisedPrompt) {
    console.log(`\nREVISED PROMPT`);
    console.log(revisedPrompt);
  }

  console.log('');

  await presentImages([result.image]);
}

main().catch(console.error);
