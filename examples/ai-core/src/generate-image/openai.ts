import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const prompt = 'A blue cream Persian cat in Kyoto in the style of ukiyo-e';
  const result = await generateImage({
    model: openai.image('gpt-image-1-mini'),
    prompt,
    n: 3,
  });

  await presentImages(result.images);

<<<<<<< HEAD
  console.log({
    prompt,
    revisedPrompt,
  });

  await presentImages([result.image]);
=======
  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
>>>>>>> 88edc2808 (feat (provider/openai): include more image generation response metadata (#10698))
}

main().catch(console.error);
