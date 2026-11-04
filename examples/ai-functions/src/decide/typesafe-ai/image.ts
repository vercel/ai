import {
  typeSafeAi,
  type TypeSafeAiFilePartProviderOptions,
} from '@ai-sdk/typesafe-ai';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: typeSafeAi.decisionModel('jev-latest'),
    state: [
      { type: 'json', value: { photo: '[animal-photo]' } },
      {
        type: 'file',
        mediaType: 'image',
        data: readFileSync('data/comic-cat.png'),
        providerOptions: {
          typesafe: {
            reference: '[animal-photo]',
          } satisfies TypeSafeAiFilePartProviderOptions,
        },
      },
    ],
    questions: {
      cat: {
        type: 'boolean',
        instructions: 'Does `photo` show a cat?',
      },
      dog: {
        type: 'boolean',
        instructions: 'Does `photo` show a dog?',
      },
    },
  });
  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
