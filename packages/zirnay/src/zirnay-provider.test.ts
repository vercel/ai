import { describe, expect, it } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createZirnay, zirnay } from './zirnay-provider';

const server = createTestServer({
  'https://api.zirnay.com/v1/teams/fraud-ops/models': {
    response: {
      type: 'json-value',
      body: { status: 'created', slug: 'laya-card-auth' },
    },
  },
  'https://api.zirnay.com/v1/teams/fraud-ops/models/laya-card-auth': {
    response: {
      type: 'json-value',
      body: { status: 'updated' },
    },
  },
  'https://api.zirnay.com/v1/teams/fraud-ops/models/laya-card-auth/decide': {
    response: {
      type: 'json-value',
      body: {
        request_id: 'req_8819d-29384',
        decision: 'DECLINE',
        confidence: 0.9842,
        execution_nanos: 1842000,
      },
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

describe('zirnayProvider', () => {
  it('instantiates the default provider with specificationVersion v4', () => {
    expect(zirnay.specificationVersion).toBe('v4');
  });

  it('creates decision models with decisionModel and evaluationModel', () => {
    const provider = createZirnay({ apiKey: 'test-key' });
    const model = provider.decisionModel('zirnay/anyjev-fast-router:latest');
    expect(model.specificationVersion).toBe('v4');
    expect(model.modelId).toBe('zirnay/anyjev-fast-router:latest');
    expect(model.provider).toBe('zirnay.decision');

    const evalModel = provider.evaluationModel(
      'zirnay/anyjev-fast-router:latest',
    );
    expect(evalModel.modelId).toBe('zirnay/anyjev-fast-router:latest');
  });

  it('throws NoSuchModelError for unsupported model types', () => {
    const provider = createZirnay({ apiKey: 'test-key' });
    expect(() => provider.languageModel('any')).toThrow();
    expect(() => provider.embeddingModel('any')).toThrow();
    expect(() => provider.imageModel('any')).toThrow();
  });

  it('registers a model definition via registerModel and createModel alias', async () => {
    const provider = createZirnay({ apiKey: 'test-key' });
    const res = await provider.registerModel({
      teamSlug: 'fraud-ops',
      name: 'Cardholder Fraud Reflex Guard',
      slug: 'laya-card-auth',
      engineType: 'laya',
    });
    expect(res).toEqual({ status: 'created', slug: 'laya-card-auth' });

    const aliasRes = await provider.createModel({
      teamSlug: 'fraud-ops',
      name: 'Cardholder Fraud Reflex Guard',
      slug: 'laya-card-auth',
      engineType: 'laya',
    });
    expect(aliasRes).toEqual({ status: 'created', slug: 'laya-card-auth' });
  });

  it('updates model config via updateModelConfig using PATCH', async () => {
    const provider = createZirnay({ apiKey: 'test-key' });
    const res = await provider.updateModelConfig({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      config: { engine_type: 'laya' },
    });
    expect(res).toEqual({ status: 'updated' });
    const updateCall = server.calls.find(c =>
      c.requestUrl.endsWith('/teams/fraud-ops/models/laya-card-auth'),
    );
    expect(updateCall?.requestMethod).toBe('PATCH');
  });

  it('executes direct warm decide via directDecide', async () => {
    const provider = createZirnay({ apiKey: 'test-key' });
    const res = await provider.directDecide({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      rawText: 'Test transaction',
    });
    expect(res.decision).toBe('DECLINE');
    expect(res.confidence).toBe(0.9842);
    expect(res.executionNanos).toBe(1842000);
  });

  it('submits feedback via submitFeedback', async () => {
    const provider = createZirnay({ apiKey: 'test-key' });
    const res = await provider.submitFeedback({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      requestId: 'req_8819d-29384',
      actualOutcome: 'DECLINE',
      feedbackType: 'CORRECTION',
    });
    expect(res.feedbackId).toBe('fb_77e02b19');
    expect(res.cacheCleared).toBe(true);
    expect(res.ingestedToBuffer).toBe(true);
  });

  it('supports alias argument names in submitFeedback and lifecycle methods', async () => {
    const provider = createZirnay({ apiKey: 'test-key' });
    const res = await provider.submitFeedback({
      team: 'fraud-ops',
      model: 'laya-card-auth',
      decisionId: 'req_8819d-29384',
      target: 'APPROVE',
      feedbackType: 'override',
      reviewer: 'analyst_42',
    });
    expect(res.feedbackId).toBe('fb_77e02b19');

    const updateRes = await provider.updateModelConfig({
      team: 'fraud-ops',
      model: 'laya-card-auth',
      config: { engine_type: 'laya' },
    });
    expect(updateRes).toEqual({ status: 'updated' });
  });

  it('uploads a dataset, triggers training, and activates checkpoint', async () => {
    const provider = createZirnay({ apiKey: 'test-key' });
    const uploadRes = await provider.uploadDataset({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      filename: 'dataset.jsonl',
      data: '{"text": "sample"}',
      format: {
        dataset_name: 'test',
        fields: [{ name: 'text', datatype: 'string', role: 'feature' }],
      },
    });
    expect(uploadRes.datasetId).toBe('ds_9a12c84e');

    const trainRes = await provider.triggerTraining({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      datasetId: uploadRes.datasetId!,
    });
    expect(trainRes.job_id).toBe('job_44a2b91c');

    const activateRes = await provider.activateCheckpoint({
      teamSlug: 'fraud-ops',
      modelSlug: 'laya-card-auth',
      checkpointId: 'chk_89f02c77',
    });
    expect(activateRes.status).toBe('ACTIVE');
  });
});
