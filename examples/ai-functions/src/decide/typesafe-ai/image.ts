import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: typeSafeAi.decisionModel('jev-latest'),
    state: [
      { type: 'text', text: 'Inspect the animal in this picture.' },
      {
        type: 'file',
        mediaType: 'image/png',
        data: readFileSync('data/comic-cat.png'),
      },
    ],
    questions: {
      cat: { type: 'boolean', instructions: 'Does the image show a cat?' },
      dog: { type: 'boolean', instructions: 'Does the image show a dog?' },
    },
  });
  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
