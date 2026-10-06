import { readFile } from 'node:fs/promises';
import { liquid } from '@ai-sdk/liquid';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const image = await readFile('data/comic-cat.png');
  const result = await experimental_decide({
    model: liquid.decisionModel('d1'),
    state: {
      context: 'Inspect the supplied image.',
      images: [
        {
          content_type: 'image/png',
          base64: image.toString('base64'),
        },
      ],
    },
    questions: {
      animal: {
        type: 'choice',
        instructions: 'Which animal appears in the image?',
        criteria: { cat: 'Cat', dog: 'Dog', other: 'Another animal' },
      },
      illustrated: {
        type: 'boolean',
        instructions: 'Is this an illustration rather than a photograph?',
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage (including image tokens):', result.usage);
  return result;
});
