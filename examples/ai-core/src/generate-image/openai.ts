import { openai } from '@ai-sdk/openai';
import { generateImage } from 'ai';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: openai.image('dall-e-3'),
    prompt: 'Santa Claus driving a Cadillac',
    maxRetries: 0,
  });

  console.log(images);
}

main().catch(console.error);
