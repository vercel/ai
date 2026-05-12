import { google, type GoogleEmbeddingModelOptions } from '@ai-sdk/google';
import { embed } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { embedding, usage, warnings } = await embed({
    model: google.embeddingModel('gemini-embedding-2-preview'),
    value: 'describe this video',
    providerOptions: {
      google: {
        content: [
          [
            {
              fileData: {
                fileUri:
                  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                mimeType: 'application/pdf',
              },
            },
          ],
        ],
      } satisfies GoogleEmbeddingModelOptions,
    },
  });

  console.log('embedding length:', embedding.length);
  console.log('first 5:', embedding.slice(0, 5));
  console.log('usage:', usage);
  console.log('warnings:', warnings);
});
