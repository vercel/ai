import { inception } from '@ai-sdk/inception';
import { experimental_decide as decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await decide({
    model: inception.decisionModel('mercury-decide'),
    state: [
      { type: 'text', text: 'Inspect the animal in this image.' },
      {
        type: 'file',
        mediaType: 'image/png',
        data: readFileSync('data/comic-cat.png'),
      },
    ],
    questions: {
      cat: { type: 'boolean', instructions: 'Does the image show a cat?' },
      animal: {
        type: 'choice',
        criteria: { cat: null, dog: null, other: null },
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
