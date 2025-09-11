import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';

async function main() {
  const prompt = 'Santa Claus driving a Cadillac';
  const result = await generateImage({
    model: openai.image('dall-e-3'),
    prompt,
  });

  console.log(result.usage);

}

main().catch(console.error);