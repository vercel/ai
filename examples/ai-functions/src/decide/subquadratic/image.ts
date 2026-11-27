import { subquadratic } from '@ai-sdk/subquadratic';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: subquadratic.decisionModel('subq-snap-1.2'),
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
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Provider metadata:', result.providerMetadata);
});
