import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: typeSafeAi.decisionModel('jev-preview'),
    state: [
      { type: 'text', text: 'Inspect the animal in this picture.' },
      {
        type: 'file',
        mediaType: 'image',
        data: readFileSync('data/comic-cat.png'),
      },
    ],
    questions: {
      cat: {
        type: 'boolean',
        instructions: 'Does the image show a cat?',
      },
      bounds: {
        type: 'box',
        instructions: 'The cat in the image',
      },
    },
  });
  console.log('Answers:', result.answers);
  console.log('Confidence:', result.providerMetadata?.typesafe?.confidence);
  console.log('Usage:', result.usage);
});
