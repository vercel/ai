import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai('gpt-4o', {
      // AI SDK will download the images and add them as data:
      downloadImages: true,
    }),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'image',
            image:
              'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',

            // OpenAI specific extension - image detail:
            experimental_providerMetadata: {
              openai: { imageDetail: 'low' },
            },
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
