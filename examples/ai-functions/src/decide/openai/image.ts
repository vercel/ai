import { openai } from '@ai-sdk/openai';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: openai.decisionModel('gpt-6-luna'),
    state: [
      { type: 'text', text: 'Inspect the animal in this picture.' },
      { type: 'json', value: { expectedAnimal: 'cat' } },
      {
        type: 'file',
        mediaType: 'image/png',
        data: readFileSync('data/comic-cat.png'),
      },
    ],
    questions: {
      cat: { type: 'boolean', instructions: 'Does the image show a cat?' },
    },
  });
  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
