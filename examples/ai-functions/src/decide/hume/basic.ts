import { hume } from '@ai-sdk/hume';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: hume.decisionModel('audio-decisions'),
    state: [
      {
        type: 'text',
        text: 'A short recorded reading about a historical scientist.',
      },
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
      delivery: {
        type: 'choice',
        instructions: 'Which best describes how the speaker delivers the text?',
        criteria: {
          reading: 'Reading from a prepared text',
          conversational: 'Speaking spontaneously in conversation',
          performing: 'Performing for an audience',
        },
      },
      clarity: {
        type: 'score',
        instructions: 'How clearly can the speaker be understood?',
        criteria: ['Hard to understand', 'Somewhat clear', 'Very clear'],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
  console.log('Provider metadata:', result.providerMetadata);
});
