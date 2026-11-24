import { baseten } from '@ai-sdk/baseten';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: baseten.decisionModel('decision-models/baseten-groundhog-latest'),
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
      child_friendly: {
        type: 'boolean',
        instructions: 'Is the illustration suitable for young children?',
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Provider metadata:', result.providerMetadata);
});
