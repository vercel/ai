import { zirnay, type ZirnayDecisionModelOptions } from '@ai-sdk/zirnay';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: zirnay.decisionModel('zirnay/anyjev-fast-router:latest'),
    providerOptions: {
      zirnay: {
        constraints: {
          maxEceThreshold: 0.05,
          minConfidence: 0.8,
        },
        arbitrationStrategy: 'calibrated_utility',
      } satisfies ZirnayDecisionModelOptions,
    },
    state: {
      deal_id: '356401732297',
      customer: 'Stripe',
      stage: 'Appointment Scheduled',
      target_close_days: 65,
      crm_assertions: {
        metrics: 'GREEN',
        economic_buyer: 'YELLOW',
        paper_process: 'YELLOW',
      },
      evidence_sources: [
        {
          source: 'gong',
          id: 'call_14',
          snippet: 'VP Infra engaged; legal review queued.',
        },
      ],
    },
    questions: {
      forecastCommit: {
        type: 'choice',
        instructions:
          'Should this deal be committed to the current quarter forecast?',
        criteria: {
          COMMIT_APPROVED: 'High confidence commit to current quarter',
          COMMIT_REJECTED: 'Defer or push to future pipeline',
        },
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Forecast decision:', result.answers.forecastCommit);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
  console.log('Zirnay Metadata:', result.providerMetadata?.zirnay);
});
