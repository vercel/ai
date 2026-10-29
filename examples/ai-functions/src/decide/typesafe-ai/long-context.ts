import {
  typeSafeAi,
  type TypeSafeAiDecisionModelOptions,
} from '@ai-sdk/typesafe-ai';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: typeSafeAi.decisionModel('jev-preview'),
    state:
      'The agreement describes routine service obligations. '.repeat(6000) +
      'Either party may terminate the agreement with 30 days of written notice.',
    questions: {
      termination: {
        type: 'boolean',
        instructions: 'Does the agreement include a termination clause?',
      },
    },
    providerOptions: {
      typesafe: {
        longContext: true,
      } satisfies TypeSafeAiDecisionModelOptions,
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
});
