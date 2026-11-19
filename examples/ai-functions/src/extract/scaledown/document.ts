import { scaledown } from '@ai-sdk/scaledown';
import { experimental_extract } from 'ai';
import { readFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_extract({
    model: scaledown.extractionModel('extract-1'),
    state: [
      {
        type: 'file',
        data: await readFile('data/ai.pdf'),
        mediaType: 'application/pdf',
      },
    ],
    fields: {
      title: { type: 'text', instructions: 'The document title' },
      topics: {
        type: 'list',
        items: 'text',
        instructions: 'Named AI techniques',
      },
    },
    providerOptions: { scaledown: { threshold: 0.5 } },
  });

  console.log('Answers:', JSON.stringify(result.answers, null, 2));
  console.log('OCR text:', result.providerMetadata?.scaledown?.ocrText);
});
