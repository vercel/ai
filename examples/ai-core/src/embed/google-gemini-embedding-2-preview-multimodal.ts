import {
  google,
  type GoogleGenerativeAIEmbeddingProviderOptions,
} from '@ai-sdk/google';
import { embed } from 'ai';
import { readFileSync } from 'fs';
import { run } from '../lib/run';

run(async () => {
  const imageData = readFileSync('./data/comic-cat.png').toString('base64');

  const { embedding, usage } = await embed({
    model: google.textEmbeddingModel('gemini-embedding-2-preview'),
    value: 'sunny day at the beach',
    providerOptions: {
      google: {
        content: [
          [
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageData,
              },
            },
          ],
        ],
      } satisfies GoogleGenerativeAIEmbeddingProviderOptions,
    },
  });

  console.log(embedding);
  console.log(usage);
});
