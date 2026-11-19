import { heygen } from '@ai-sdk/heygen';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: heygen.decisionModel('heygen-decision-1'),
    state: [
      { type: 'text', text: 'Review this clip before it is published.' },
      {
        type: 'file',
        mediaType: 'video/mp4',
        data: readFileSync('./data/prudence.mp4'),
      },
    ],
    questions: {
      person: {
        type: 'boolean',
        instructions: 'Does the video show a person?',
      },
      setting: {
        type: 'choice',
        instructions: 'Where does the video take place?',
        criteria: { indoors: null, outdoors: null },
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
