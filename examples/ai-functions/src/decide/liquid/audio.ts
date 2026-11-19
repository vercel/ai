import { liquid } from '@ai-sdk/liquid';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: liquid.decisionModel('d1.2'),
    state: [
      {
        type: 'file',
        mediaType: 'audio/mpeg',
        data: readFileSync('./data/galileo.mp3'),
      },
    ],
    questions: {
      science: {
        type: 'boolean',
        instructions: 'Does the speaker talk about science or a scientist?',
      },
      language: {
        type: 'choice',
        instructions: 'Which language does the speaker use?',
        criteria: {
          english: 'English',
          spanish: 'Spanish',
          french: 'French',
          german: 'German',
        },
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
