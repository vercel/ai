import { describe, expect, it } from 'vitest';
import { experimental_decide } from 'ai';
import {
  createZirnay,
  type ZirnayDecisionModelOptions,
  type ZirnayDecisionProviderMetadata,
} from '@ai-sdk/zirnay';

const mockResponse = {
  id: 'dec-zirnay-88e2c39a',
  object: 'decision',
  created: 1729729050,
  model: 'zirnay/anyjev-fast-router:latest',
  decision: {
    selected_candidate_id: 'COMMIT_APPROVED',
    confidence: 0.942,
    calibrated_probability: 0.938,
    margin_over_second: 0.881,
  },
  candidate_scores: [
    {
      candidate_id: 'COMMIT_APPROVED',
      raw_logit: 3.84,
      calibrated_prob: 0.938,
      utility_score: 0.912,
    },
    {
      candidate_id: 'COMMIT_REJECTED',
      raw_logit: -1.12,
      calibrated_prob: 0.062,
      utility_score: 0.041,
    },
  ],
  telemetry: {
    latency_ms: 17.2,
    expected_calibration_error: 0.018,
    permutation_rounds: 4,
    data_retention: 'DISABLED',
  },
};

describe('Zirnay decide doc examples end-to-end', () => {
  it('exercises the code in content/providers/01-ai-sdk-providers/115-zirnay.mdx', async () => {
    const customZirnay = createZirnay({
      apiKey: 'test-key',
      fetch: async () =>
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const result = await experimental_decide({
      model: customZirnay.decisionModel('zirnay/anyjev-fast-router:latest'),
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
      },
      questions: {
        forecastCommit: {
          type: 'choice',
          instructions:
            'Should this deal be committed to current quarter forecast?',
          criteria: {
            COMMIT_APPROVED: 'High confidence commit to current quarter',
            COMMIT_REJECTED: 'Defer or push to future pipeline',
          },
        },
      },
      providerOptions: {
        zirnay: {
          constraints: {
            maxEceThreshold: 0.03,
            minConfidence: 0.85,
          },
          arbitrationStrategy: 'calibrated_utility',
        } satisfies ZirnayDecisionModelOptions,
      },
    });

    // 1. Validate choice answer fields: choice and probabilities
    expect(result.answers.forecastCommit.choice).toBe('COMMIT_APPROVED');
    expect(result.answers.forecastCommit.probabilities?.COMMIT_APPROVED).toBe(
      0.938,
    );

    // 2. Validate provider metadata indexing
    const metadata = result.providerMetadata?.zirnay as
      | ZirnayDecisionProviderMetadata
      | undefined;

    expect(result.response.id).toBe('dec-zirnay-88e2c39a');
    expect(metadata?.confidence['forecastCommit']).toBe(0.942);
    expect(metadata?.calibratedProbability['forecastCommit']).toBe(0.938);
    expect(
      metadata?.telemetry['forecastCommit']?.expectedCalibrationError,
    ).toBe(0.018);
    expect(metadata?.telemetry['forecastCommit']?.latencyMs).toBe(17.2);
  });
});
