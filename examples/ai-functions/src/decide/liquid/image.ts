import { liquid } from '@ai-sdk/liquid';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: liquid.decisionModel('d1.2'),
    state: [
      { type: 'text', text: 'An illustration submitted for a picture book.' },
      {
        type: 'file',
        mediaType: 'image/png',
        data: readFileSync('./data/comic-cat.png'),
      },
    ],
    questions: {
      animal: {
        type: 'choice',
        instructions: 'Which animal is shown in the illustration?',
        criteria: { cat: null, dog: null, bird: null },
      },
      cat: {
        type: 'box',
        instructions: 'The cat.',
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Provider metadata:', result.providerMetadata);
});
