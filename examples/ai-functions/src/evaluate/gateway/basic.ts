import type { GatewayEvaluationProviderOptions } from '@ai-sdk/gateway';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

const questions = {
  department: {
    type: 'choice',
    instructions: 'Which team should handle this?',
    criteria: {
      billing: 'Charges and refunds',
      technical: 'Bugs and outages',
      other: null,
    },
  },
  severity: {
    type: 'score',
    instructions: 'How severe is the issue?',
    criteria: ['Cosmetic', 'Workaround exists', 'Blocking; no workaround'],
  },
  requestsRefund: {
    type: 'boolean',
    instructions: 'Is the customer requesting money back?',
  },
} as const;

run(async () => {
  const result = await experimental_evaluate({
    model: 'typesafe-ai/jev',
    state: 'I was charged twice. Please refund the duplicate.',
    questions,
    providerOptions: {
      gateway: {
        models: [
          {
            model: 'openai/gpt-5.6-sol',
            when: {
              any: [
                { question: 'department', confidenceBelow: 0.6 },
                {
                  question: 'requestsRefund',
                  probabilityBetween: [0.4, 0.6],
                },
              ],
            },
          },
        ],
      } satisfies GatewayEvaluationProviderOptions<keyof typeof questions>,
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);

  // TypeSafe reports per-question confidence here rather than on the answers.
  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
});
