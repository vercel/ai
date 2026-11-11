import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  createZirnay,
  zirnay,
  type ZirnayDecisionModelOptions,
  type ZirnayDecisionProviderMetadata,
} from './index';

const fixtureResponse = JSON.parse(
  readFileSync(
    new URL('__fixtures__/decision-response.json', import.meta.url),
    'utf8',
  ),
);

const server = createTestServer({
  'https://api.zirnay.com/v1/decisions': {
    response: {
      type: 'json-value',
      body: fixtureResponse,
    },
  },
  'https://api.zirnay.com/v1/teams/fraud-ops/models': {
    response: {
      type: 'json-value',
      body: { status: 'created', slug: 'laya-card-auth' },
    },
  },
  'https://api.zirnay.com/v1/teams/fraud-ops/models/laya-card-auth/feedback': {
    response: {
      type: 'json-value',
      body: {
        feedback_id: 'fb_77e02b19',
        cache_cleared: true,
        ingested_to_buffer: true,
      },
    },
  },
  'https://api.zirnay.com/v1/teams/fraud-ops/models/laya-card-auth/datasets/upload':
    {
      response: {
        type: 'json-value',
        body: {
          dataset_id: 'ds_9a12c84e',
          status: 'READY',
          record_count: 1,
        },
      },
    },
  'https://api.zirnay.com/v1/teams/fraud-ops/models/laya-card-auth/train': {
    response: {
      type: 'json-value',
      body: {
        job_id: 'job_44a2b91c',
        status: 'QUEUED',
      },
    },
  },
  'https://api.zirnay.com/v1/teams/fraud-ops/models/laya-card-auth/checkpoints/chk_89f02c77/activate':
    {
      response: {
        type: 'json-value',
        body: {
          status: 'ACTIVE',
        },
      },
    },
});

describe('115-zirnay.mdx documentation examples', () => {
  beforeEach(() => {
    process.env.ZIRNAY_API_KEY = 'test-api-key';
    server.urls['https://api.zirnay.com/v1/decisions'].response = {
      type: 'json-value',
      body: {
        ...fixtureResponse,
        decision: {
          ...fixtureResponse.decision,
          selected_candidate_id: 'COMMIT_APPROVED',
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
      },
    };
  });

  it('runs the basic decision model doDecide and accesses choice and probabilities', async () => {
    const model = zirnay.decisionModel('zirnay/anyjev-fast-router:latest');
    const result = await model.doDecide({
      state: [
        {
          type: 'json',
          value: {
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
        },
      ],
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
    });

    // Verify choice answer access
    const answer = result.answers.forecastCommit;
    expect(answer.type).toBe('choice');
    if (answer.type === 'choice') {
      expect(answer.choice).toBe('COMMIT_APPROVED');
      expect(answer.probabilities?.COMMIT_APPROVED).toBe(0.938);
    }
  });

  it('runs custom provider configuration example', () => {
    const customZirnay = createZirnay({
      apiKey: 'test-custom-key',
      accountId: 'org_enterprise_secops',
      baseURL: 'https://api.zirnay.com/v1',
    });
    expect(customZirnay.specificationVersion).toBe('v4');
  });

  it('runs constraints and providerOptions example with typed metadata', async () => {
    const model = zirnay.decisionModel('zirnay/anyjev-fast-router:latest');
    const result = await model.doDecide({
      providerOptions: {
        zirnay: {
          constraints: {
            maxEceThreshold: 0.03,
            minConfidence: 0.85,
          },
          arbitrationStrategy: 'calibrated_utility',
        } satisfies ZirnayDecisionModelOptions,
      },
      state: [{ type: 'text', text: 'test deal' }],
      questions: {
        forecastCommit: {
          type: 'choice',
          instructions: 'Evaluate transaction risk',
          criteria: {
            COMMIT_APPROVED: 'High confidence commit',
            COMMIT_REJECTED: 'Defer or push to future pipeline',
          },
        },
      },
    });

    // Metadata indexing with exported ZirnayDecisionProviderMetadata type
    const metadata = result.providerMetadata?.zirnay as
      | ZirnayDecisionProviderMetadata
      | undefined;

    expect(result.response?.id).toBe('dec-zirnay-88e2c39a');
    expect(metadata?.confidence['forecastCommit']).toBe(0.942);
    expect(metadata?.calibratedProbability['forecastCommit']).toBe(0.938);
    expect(
      metadata?.telemetry['forecastCommit']?.expectedCalibrationError,
    ).toBe(0.018);
    expect(metadata?.telemetry['forecastCommit']?.latencyMs).toBe(17.2);
  });

  it('runs submitFeedback example', async () => {
    const feedback = await zirnay.submitFeedback({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      requestId: 'dec-zirnay-88e2c39a',
      actualOutcome: 'APPROVE',
      feedbackType: 'CORRECTION',
      reviewer: {
        reviewerId: 'usr_analyst_42',
        reviewerRole: 'SUPERVISOR',
        notes: 'Human-verified valid cardholder transaction',
      },
    });

    expect(feedback.feedbackId).toBe('fb_77e02b19');
    expect(feedback.cacheCleared).toBe(true);
    expect(feedback.ingestedToBuffer).toBe(true);
  });

  it('runs complete lifecycle: registerModel, uploadDataset, triggerTraining, activateCheckpoint', async () => {
    // 1. Register a new model definition
    const registered = await zirnay.registerModel({
      teamSlug: 'fraud-ops',
      name: 'Cardholder Fraud Reflex Guard',
      slug: 'laya-card-auth',
      engineType: 'laya',
      version: '1.0.0',
      classes: ['APPROVE', 'CHALLENGE', 'DECLINE'],
    });
    expect(registered.slug).toBe('laya-card-auth');

    // 2. Upload training dataset (JSONL string)
    const dataset = await zirnay.uploadDataset({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      filename: 'fraud-train-v1.jsonl',
      data: '{"amount_cents": 4200, "currency": "USD", "is_fraud": "DECLINE"}\n',
      format: {
        dataset_name: 'fraud-train-v1.jsonl',
        target_field: 'is_fraud',
        fields: [
          { name: 'amount_cents', datatype: 'integer', role: 'feature' },
          { name: 'currency', datatype: 'string', role: 'feature' },
          { name: 'is_fraud', datatype: 'string', role: 'target' },
        ],
      },
    });
    expect(dataset.datasetId).toBe('ds_9a12c84e');

    // 3. Trigger training run
    const training = await zirnay.triggerTraining({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      datasetId: dataset.datasetId!,
      hyperparameters: { epochs: 10, batchSize: 64 },
    });
    expect(training.job_id).toBe('job_44a2b91c');

    // 4. Activate verified checkpoint in production
    const activated = await zirnay.activateCheckpoint({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      checkpointId: 'chk_89f02c77',
    });
    expect(activated.status).toBe('ACTIVE');
  });

  it('correctly reads content when uploadDataset receives a Blob file', async () => {
    const datasetBlob = new Blob(
      ['{"amount_cents": 1500, "currency": "EUR", "is_fraud": "APPROVE"}\n'],
      { type: 'application/jsonlines' },
    );

    const dataset = await zirnay.uploadDataset({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      filename: 'fraud-blob-test.jsonl',
      file: datasetBlob,
      format: {
        dataset_name: 'fraud-blob-test.jsonl',
        fields: [
          { name: 'amount_cents', datatype: 'integer', role: 'feature' },
        ],
      },
    });
    expect(dataset.datasetId).toBe('ds_9a12c84e');

    const call = server.calls.find(c =>
      c.requestUrl.endsWith('/datasets/upload'),
    );
    expect(call).toBeDefined();
    const body = (await call!.requestBodyJson) as Record<string, unknown>;
    expect(body.data).toBe(
      '{"amount_cents": 1500, "currency": "EUR", "is_fraud": "APPROVE"}\n',
    );
  });

  it('strips version tag when submitFeedback receives an explicit team and bare tagged model', async () => {
    await zirnay.submitFeedback({
      team: 'fraud-ops',
      model: 'laya-card-auth:latest',
      requestId: 'req_8819d-29384',
      actualOutcome: 'APPROVE',
    });

    const call = server.calls.find(
      c =>
        c.requestUrl.endsWith('/feedback') &&
        c.requestUrl.includes('fraud-ops'),
    );
    expect(call).toBeDefined();
    // Verify version tag ':latest' was stripped from URL
    expect(call!.requestUrl).toBe(
      'https://api.zirnay.com/v1/teams/fraud-ops/models/laya-card-auth/feedback',
    );
    expect(call!.requestUrl).not.toContain(':latest');
  });
});
