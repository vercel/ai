import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import {
  customProvider,
  createProviderRegistry,
  experimental_decide,
} from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const registry = createProviderRegistry({
    triage: customProvider({
      decisionModels: { native: typeSafeAi.decisionModel('jev-latest') },
    }),
  });

  const { answers } = await experimental_decide({
    model: registry.decisionModel('triage:native'),
    state: 'I was charged twice. Please refund the duplicate.',
    questions: {
      department: {
        type: 'choice',
        instructions: 'Which team should handle this?',
        criteria: { billing: 'Charges and refunds', support: 'Other requests' },
      },
      requestsRefund: {
        type: 'boolean',
        instructions: 'Does the customer request money back?',
      },
    },
  });

  const department = answers.department;
  const selectedProbability = department.probabilities?.[department.choice];
  // These thresholds are application policy; validate them against labeled data.
  console.log(
    'Route:',
    selectedProbability != null && selectedProbability >= 0.9
      ? department.choice
      : 'manual review',
  );
  console.log('Refund queue:', answers.requestsRefund.probability >= 0.8);
});
