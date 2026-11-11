import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { DecisionZirnayModel } from './zirnay-decision-model';

const fixtureResponse = JSON.parse(
  readFileSync(
    new URL('__fixtures__/decision-response.json', import.meta.url),
    'utf8',
  ),
);

const decisionsUrl = 'https://api.zirnay.com/v1/decisions';
const server = createTestServer({
  [decisionsUrl]: {
    response: {
      type: 'json-value',
      body: fixtureResponse,
    },
  },
});

describe('DecisionZirnayModel', () => {
  beforeEach(() => {
    server.urls[decisionsUrl].response = {
      type: 'json-value',
      body: fixtureResponse,
    };
  });

  const model = new DecisionZirnayModel(
    'acme-corp/secops/anyjev-fast-router:v2-strict',
    {
      provider: 'zirnay.decision',
      baseURL: 'https://api.zirnay.com/v1',
      headers: { Authorization: 'Bearer test-key' },
    },
  );

  it('evaluates choice decisions and maps candidate scores, audit trail, and telemetry', async () => {
    const result = await model.doDecide({
      state: [
        {
          type: 'json',
          value: {
            deal_id: '356401732297',
            customer: 'Stripe',
          },
        },
      ],
      questions: {
        forecast: {
          type: 'choice',
          criteria: {
            COMMIT_APPROVED: 'Commit to Current Quarter Forecast',
            BEST_CASE_GATED: 'Best Case Gated',
          },
        },
      },
    });

    expect(result.answers.forecast).toEqual({
      type: 'choice',
      choice: 'BEST_CASE_GATED',
      probabilities: {
        BEST_CASE_GATED: 0.938,
        COMMIT_APPROVED: 0.062,
      },
    });

    expect(result.providerMetadata?.zirnay).toMatchObject({
      confidence: { forecast: 0.942 },
      calibratedProbability: { forecast: 0.938 },
      marginOverSecond: { forecast: 0.881 },
      auditTrail: {
        forecast: {
          reasoningCode: 'VR_GATE_ECONOMIC_BUYER_UNVALIDATED',
        },
      },
      telemetry: {
        forecast: {
          latencyMs: 17.2,
          expectedCalibrationError: 0.018,
        },
      },
    });

    expect(result.response?.id).toBe('dec-zirnay-88e2c39a');
    expect(server.calls).toHaveLength(1);
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'acme-corp/secops/anyjev-fast-router:v2-strict',
      decision_type: 'categorical_choice',
      candidates: [
        { id: 'COMMIT_APPROVED', label: 'Commit to Current Quarter Forecast' },
        { id: 'BEST_CASE_GATED', label: 'Best Case Gated' },
      ],
    });
  });

  it('correctly maps boolean probability when selecting false without scores', async () => {
    server.urls[decisionsUrl].response = {
      type: 'json-value',
      body: {
        id: 'dec-bool-false',
        decision_id: 'dec-bool-false',
        model: 'zirnay/laya:latest',
        decision: {
          selected_candidate_id: 'false',
        },
      },
    };

    const result = await model.doDecide({
      state: [{ type: 'text', text: 'Test state' }],
      questions: {
        isFraud: { type: 'boolean', instructions: 'Is this fraudulent?' },
      },
    });

    expect(result.answers.isFraud).toEqual({
      type: 'boolean',
      probability: 0,
    });
  });

  it('correctly maps boolean probability when selecting false with calibrated probability', async () => {
    server.urls[decisionsUrl].response = {
      type: 'json-value',
      body: {
        id: 'dec-bool-false-prob',
        decision_id: 'dec-bool-false-prob',
        model: 'zirnay/laya:latest',
        decision: {
          selected_candidate_id: 'false',
          calibrated_probability: 0.85,
        },
      },
    };

    const result = await model.doDecide({
      state: [{ type: 'text', text: 'Test state' }],
      questions: {
        isFraud: { type: 'boolean', instructions: 'Is this fraudulent?' },
      },
    });

    expect(result.answers.isFraud).toMatchObject({
      type: 'boolean',
      probability: expect.closeTo(0.15, 5),
    });
  });

  it('correctly maps boolean probability when selecting true without scores', async () => {
    server.urls[decisionsUrl].response = {
      type: 'json-value',
      body: {
        id: 'dec-bool-true',
        decision_id: 'dec-bool-true',
        model: 'zirnay/laya:latest',
        decision: {
          selected_candidate_id: 'true',
        },
      },
    };

    const result = await model.doDecide({
      state: [{ type: 'text', text: 'Test state' }],
      questions: {
        isFraud: { type: 'boolean', instructions: 'Is this fraudulent?' },
      },
    });

    expect(result.answers.isFraud).toEqual({
      type: 'boolean',
      probability: 1,
    });
  });

  it('preserves instructions in request body and input for choice and score questions', async () => {
    await model.doDecide({
      state: [{ type: 'text', text: 'Transaction at 3am' }],
      questions: {
        isHipaaCompliant: {
          type: 'choice',
          instructions: 'Evaluate HIPAA compliance',
          criteria: { YES: 'Compliant', NO: 'Non-compliant' },
        },
        urgency: {
          type: 'score',
          instructions: 'Rate operational urgency',
          criteria: ['Low', 'High'],
        },
      },
    });

    expect(server.calls).toHaveLength(2);

    const hipaaCall = (await server.calls[0].requestBodyJson) as Record<
      string,
      unknown
    >;
    expect(hipaaCall.instructions).toBe('Evaluate HIPAA compliance');
    expect((hipaaCall.input as Record<string, unknown>).instruction).toBe(
      'Evaluate HIPAA compliance',
    );

    const urgencyCall = (await server.calls[1].requestBodyJson) as Record<
      string,
      unknown
    >;
    expect(urgencyCall.instructions).toBe('Rate operational urgency');
    expect((urgencyCall.input as Record<string, unknown>).instruction).toBe(
      'Rate operational urgency',
    );
  });

  it('rejects unsupported file state', async () => {
    await expect(
      model.doDecide({
        state: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: 'abc' },
          },
        ],
        questions: {
          q: { type: 'choice', criteria: { A: 'A' } },
        },
      }),
    ).rejects.toThrow('Zirnay Decisions file input');
  });
});
