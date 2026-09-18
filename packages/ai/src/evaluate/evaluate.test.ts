import {
  APICallError,
  InvalidResponseDataError,
  Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError,
  type Experimental_EvaluationModelV4Result as EvaluationModelV4Result,
} from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { UnsupportedModelVersionError } from '../error/unsupported-model-version-error';
import type { Telemetry } from '../telemetry/telemetry';
import { EvaluationMockModelV4 } from '../test/evaluation-mock-model-v4';
import { evaluate } from './evaluate';
import type { EvaluationQuestion } from './evaluation-result';

const questions = {
  topic: {
    type: 'choice',
    instructions: 'Team?',
    criteria: { billing: null, support: { includes: ['help'] } },
  },
  severity: {
    type: 'score',
    instructions: ['Severity?'],
    criteria: ['Low', 'Medium', 'High'],
  },
  refund: {
    type: 'boolean',
    instructions: 'Refund?',
    criteria: { true: 'Money back', false: null },
  },
} as const;

const answers: EvaluationModelV4Result['answers'] = {
  refund: { type: 'boolean', probability: 0.92 },
  severity: {
    type: 'score',
    score: 1.6,
    probabilities: { 0: 0, 1: 0.4, 2: 0.6 },
  },
  topic: {
    type: 'choice',
    choice: 'billing',
    probabilities: { billing: 0.9, support: 0.1 },
  },
};

function setup(result: EvaluationModelV4Result = { answers, warnings: [] }) {
  const doEvaluate = vi
    .fn<EvaluationMockModelV4['doEvaluate']>()
    .mockResolvedValue(result);
  return { doEvaluate, model: new EvaluationMockModelV4({ doEvaluate }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('evaluates mixed questions in one call and preserves distributions and metadata', async () => {
  const warning = { type: 'other', message: 'Provider note' } as const;
  const timestamp = new Date('2026-09-16T12:00:00Z');
  const providerMetadata = { test: { confidence: 0.8 } };
  const logger = vi.fn();
  vi.stubGlobal('AI_SDK_LOG_WARNINGS', logger);
  const { model, doEvaluate } = setup({
    answers,
    warnings: [warning],
    usage: { inputTokens: 30, outputTokens: 4 },
    providerMetadata,
    response: {
      id: 'response',
      timestamp,
      modelId: 'actual-model',
      headers: { 'x-request-id': 'request' },
      body: { raw: true },
    },
  });
  const abortSignal = new AbortController().signal;
  const state = { message: 'refund', history: ['hello'] };
  const result = await evaluate({
    model,
    state,
    questions,
    abortSignal,
    headers: { custom: 'value' },
    providerOptions: { test: { option: true } },
  });
  expect(doEvaluate).toHaveBeenCalledTimes(1);
  expect(doEvaluate).toHaveBeenCalledWith({
    state,
    questions,
    abortSignal,
    headers: { custom: 'value', 'user-agent': expect.stringContaining('ai/') },
    providerOptions: { test: { option: true } },
  });
  expect(result.answers).toEqual(answers);
  expect(result.usage).toEqual({
    inputTokens: 30,
    outputTokens: 4,
    totalTokens: 34,
  });
  expect(result.providerMetadata).toEqual(providerMetadata);
  expect(result.response).toEqual({
    id: 'response',
    timestamp,
    modelId: 'actual-model',
    headers: { 'x-request-id': 'request' },
    body: { raw: true },
  });
  expect(result.warnings).toEqual([warning]);
  expect(logger).toHaveBeenCalledWith({
    warnings: [warning],
    provider: model.provider,
    model: model.modelId,
  });
});

it('allows choice and score without distributions, with unknown usage left unknown', async () => {
  const result = await evaluate({
    ...setup({
      answers: {
        topic: { type: 'choice', choice: 'support' },
        severity: { type: 'score', score: 1.4 },
        refund: answers.refund,
      },
      warnings: [],
    }),
    state: '',
    questions,
  });
  expect(result.answers.topic.probabilities).toBeUndefined();
  expect(result.answers.severity.probabilities).toBeUndefined();
  expect(result.usage).toEqual({
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
  });
  expect(result.response).toEqual({
    timestamp: expect.any(Date),
    modelId: 'mock-model-id',
  });
});

it('rejects unsupported types before evaluating any question', async () => {
  const { model, doEvaluate } = setup();
  const limitedModel = new EvaluationMockModelV4({
    ...model,
    supportedQuestionTypes: ['choice', 'score'],
  });
  await expect(
    evaluate({ model: limitedModel, state: 'refund', questions }),
  ).rejects.toMatchObject({
    name: 'AI_EvaluationUnsupportedQuestionTypeError',
    questionId: 'refund',
    questionType: 'boolean',
    provider: model.provider,
    modelId: model.modelId,
  });
  await expect(
    evaluate({ model: limitedModel, state: 'refund', questions }),
  ).rejects.toBeInstanceOf(EvaluationUnsupportedQuestionTypeError);
  expect(doEvaluate).not.toHaveBeenCalled();
});

it('rejects an unsupported model version', async () => {
  const { model, doEvaluate } = setup();
  Object.assign(model, { specificationVersion: 'v99' });
  await expect(
    evaluate({ model, state: 'text', questions }),
  ).rejects.toBeInstanceOf(UnsupportedModelVersionError);
  expect(doEvaluate).not.toHaveBeenCalled();
});

describe('input validation', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  it.each([
    null,
    true,
    42,
    new Date(),
    { value: undefined },
    { value: NaN },
    { fn: () => true },
    cyclic,
    [undefined],
    new Array(2),
  ])('rejects non-JSON state %s before I/O', async state => {
    const { model, doEvaluate } = setup();
    await expect(
      evaluate({ model, state: state as never, questions }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(doEvaluate).not.toHaveBeenCalled();
  });

  it.each([
    {},
    [],
    null,
    { test: { type: 'other', instructions: 'test' } },
    { test: { type: 'boolean', instructions: null } },
    {
      test: { type: 'boolean', instructions: 'test', criteria: { yes: 'yes' } },
    },
    { test: { type: 'choice', instructions: 'test', criteria: {} } },
    { test: { type: 'choice', instructions: 'test', criteria: { a: 42 } } },
    { test: { type: 'score', instructions: 'test', criteria: ['Only one'] } },
    {
      test: {
        type: 'score',
        instructions: 'test',
        criteria: ['Low', undefined],
      },
    },
  ])('rejects invalid questions %s before I/O', async invalidQuestions => {
    const { model, doEvaluate } = setup();
    await expect(
      evaluate({ model, state: 'text', questions: invalidQuestions as never }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(doEvaluate).not.toHaveBeenCalled();
  });

  it('allows repeated JSON references without treating them as cycles', async () => {
    const shared = { text: 'hello' };
    await expect(
      evaluate({ ...setup(), state: [shared, shared], questions }),
    ).resolves.toBeDefined();
  });
});

describe('response validation', () => {
  it('accepts native rounded scores without rewriting probabilities or scores', async () => {
    const roundedAnswers = {
      ...answers,
      severity: {
        type: 'score' as const,
        score: 0.97,
        probabilities: { 0: 0.13, 1: 0.76, 2: 0.11 },
      },
    };
    const rounding = { probabilityDecimals: 2, scoreDecimals: 2 };
    const result = await evaluate({
      ...setup({ answers: roundedAnswers, rounding, warnings: [] }),
      state: 'text',
      questions,
    });
    expect(result.answers).toEqual(roundedAnswers);
    expect(result.rounding).toEqual(rounding);
    await expect(
      evaluate({
        ...setup({ answers: roundedAnswers, warnings: [] }),
        state: 'text',
        questions,
      }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  });

  it('accepts a rounded distribution sum but rejects errors beyond declared precision', async () => {
    const roundedAnswers = {
      ...answers,
      severity: {
        type: 'score' as const,
        score: 1,
        probabilities: { 0: 0.33, 1: 0.33, 2: 0.33 },
      },
    };
    const rounding = { probabilityDecimals: 2, scoreDecimals: 2 };
    await expect(
      evaluate({
        ...setup({ answers: roundedAnswers, rounding, warnings: [] }),
        state: 'text',
        questions,
      }),
    ).resolves.toBeDefined();
    await expect(
      evaluate({
        ...setup({
          answers: {
            ...roundedAnswers,
            severity: { ...roundedAnswers.severity, score: 1.5 },
          },
          rounding,
          warnings: [],
        }),
        state: 'text',
        questions,
      }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  });

  it.each([-1, 16, NaN, 1.5])(
    'rejects invalid rounding precision %s',
    async probabilityDecimals => {
      await expect(
        evaluate({
          ...setup({
            answers,
            warnings: [],
            rounding: { probabilityDecimals },
          }),
          state: 'text',
          questions,
        }),
      ).rejects.toBeInstanceOf(InvalidResponseDataError);
    },
  );

  it.each([
    null,
    [],
    {},
    { ...answers, extra: answers.refund },
    { ...answers, topic: { type: 'score', score: 1 } },
    { ...answers, topic: { type: 'choice', choice: 'other' } },
    { ...answers, topic: { type: 'choice', choice: 'toString' } },
    {
      ...answers,
      topic: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 1 },
      },
    },
    {
      ...answers,
      topic: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 0.1, support: 0.9 },
      },
    },
    { ...answers, severity: { type: 'score', score: 3 } },
    { ...answers, severity: { type: 'score', score: NaN } },
    {
      ...answers,
      severity: {
        type: 'score',
        score: 1,
        probabilities: { 0: 0, 1: 0, 2: 1 },
      },
    },
    {
      ...answers,
      severity: {
        type: 'score',
        score: 1,
        probabilities: { 0: 0.2, 1: 0.2, 2: 0.2 },
      },
    },
    {
      ...answers,
      severity: {
        type: 'score',
        score: 1,
        probabilities: { 0: -0.1, 1: 1.1, 2: 0 },
      },
    },
    {
      ...answers,
      severity: {
        type: 'score',
        score: 1,
        probabilities: { 0: NaN, 1: 1, 2: 0 },
      },
    },
    { ...answers, refund: { type: 'boolean' } },
    { ...answers, refund: { type: 'boolean', probability: null } },
    { ...answers, refund: { type: 'boolean', probability: Infinity } },
    { ...answers, refund: { type: 'boolean', probability: 1.1 } },
  ])('rejects malformed answers %s without retrying', async invalidAnswers => {
    const { model, doEvaluate } = setup({
      answers: invalidAnswers as never,
      warnings: [],
    });
    await expect(
      evaluate({ model, state: 'text', questions }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
    expect(doEvaluate).toHaveBeenCalledTimes(1);
  });

  it('accepts rounding within tolerance without modifying the distribution', async () => {
    const probabilities = { 0: 0.3333333, 1: 0.3333333, 2: 0.3333333 };
    const result = await evaluate({
      ...setup({
        answers: {
          ...answers,
          severity: { type: 'score', score: 1, probabilities },
        },
        warnings: [],
      }),
      state: 'text',
      questions,
    });
    expect(result.answers.severity.probabilities).toEqual(probabilities);
  });

  it('handles question and option keys that match object prototype properties', async () => {
    const specialQuestions = Object.fromEntries([
      [
        '__proto__',
        {
          type: 'choice',
          instructions: 'Which?',
          criteria: Object.fromEntries([
            ['__proto__', null],
            ['constructor', null],
          ]),
        },
      ],
    ]) as Record<string, EvaluationQuestion>;
    const specialAnswers = Object.fromEntries([
      ['__proto__', { type: 'choice', choice: '__proto__' }],
    ]) as EvaluationModelV4Result['answers'];
    const result = await evaluate({
      ...setup({ answers: specialAnswers, warnings: [] }),
      state: 'text',
      questions: specialQuestions,
    });
    expect(Object.keys(result.answers)).toEqual(['__proto__']);
  });
});

it('retries transient errors with the configured retry limit', async () => {
  const { model, doEvaluate } = setup();
  doEvaluate.mockRejectedValueOnce(
    new APICallError({
      message: 'Rate limited',
      url: 'https://example.com',
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { 'retry-after-ms': '0' },
    }),
  );
  await expect(
    evaluate({ model, state: 'text', questions, maxRetries: 1 }),
  ).resolves.toBeDefined();
  expect(doEvaluate).toHaveBeenCalledTimes(2);
});

it('honors maxRetries: 0', async () => {
  const { model, doEvaluate } = setup();
  const error = new APICallError({
    message: 'Overloaded',
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode: 529,
  });
  doEvaluate.mockRejectedValue(error);
  await expect(
    evaluate({ model, state: 'text', questions, maxRetries: 0 }),
  ).rejects.toBe(error);
  expect(doEvaluate).toHaveBeenCalledTimes(1);
});

it('does not call the provider when already aborted', async () => {
  const { model, doEvaluate } = setup();
  const controller = new AbortController();
  const reason = new Error('Cancelled');
  controller.abort(reason);
  await expect(
    evaluate({
      model,
      state: 'text',
      questions,
      abortSignal: controller.signal,
    }),
  ).rejects.toBe(reason);
  expect(doEvaluate).not.toHaveBeenCalled();
});

it('does not return a result after cancellation during a call', async () => {
  const { model, doEvaluate } = setup();
  const controller = new AbortController();
  const reason = new Error('Cancelled');
  doEvaluate.mockImplementation(async () => {
    controller.abort(reason);
    return { answers, warnings: [] };
  });
  await expect(
    evaluate({
      model,
      state: 'text',
      questions,
      abortSignal: controller.signal,
    }),
  ).rejects.toBe(reason);
});

describe('telemetry', () => {
  it('emits operation and model-call lifecycle events', async () => {
    const onStart = vi.fn();
    const onEvaluateStart = vi.fn();
    const onEvaluateEnd = vi.fn();
    const onEnd = vi.fn();
    const integration: Telemetry = {
      onStart,
      onEvaluateStart,
      onEvaluateEnd,
      onEnd,
    };
    const state = { message: 'refund' };

    await evaluate({
      ...setup({
        answers,
        warnings: [],
        usage: { inputTokens: 30, outputTokens: 4 },
      }),
      state,
      questions,
      telemetry: {
        integrations: integration,
        functionId: 'evaluate-test',
        recordInputs: false,
        recordOutputs: true,
      },
      runtimeContext: { requestId: 'request-1', secret: 'hidden' },
      _internal: { generateCallId: () => 'test-call-id' },
    });

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'test-call-id',
        operationId: 'ai.evaluate',
        provider: 'mock-provider',
        modelId: 'mock-model-id',
        state,
        questions,
        runtimeContext: {},
        maxRetries: 2,
        recordInputs: false,
        recordOutputs: true,
        functionId: 'evaluate-test',
      }),
    );
    expect(onEvaluateStart).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'test-call-id',
        operationId: 'ai.evaluate.doEvaluate',
        state,
        questions,
      }),
    );
    expect(onEvaluateEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'test-call-id',
        operationId: 'ai.evaluate.doEvaluate',
        answers,
        usage: { inputTokens: 30, outputTokens: 4 },
      }),
    );
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'test-call-id',
        operationId: 'ai.evaluate',
        answers,
        usage: { inputTokens: 30, outputTokens: 4, totalTokens: 34 },
        runtimeContext: {},
      }),
    );
  });

  it('includes only selected runtime context fields', async () => {
    const onStart = vi.fn();

    await evaluate({
      ...setup(),
      state: 'text',
      questions,
      telemetry: {
        integrations: { onStart },
        includeRuntimeContext: { requestId: true },
      },
      runtimeContext: { requestId: 'request-1', secret: 'hidden' },
    });

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeContext: { requestId: 'request-1' } }),
    );
  });

  it('accepts experimental_telemetry as an alias', async () => {
    const onStart = vi.fn();

    await evaluate({
      ...setup(),
      state: 'text',
      questions,
      experimental_telemetry: { integrations: { onStart } },
    });

    expect(onStart).toHaveBeenCalledOnce();
  });

  it('emits an error event when evaluation fails', async () => {
    const error = new Error('evaluation failed');
    const onError = vi.fn();
    const { model } = setup();
    model.doEvaluate = vi.fn().mockRejectedValue(error);

    await expect(
      evaluate({
        model,
        state: 'text',
        questions,
        maxRetries: 0,
        telemetry: { integrations: { onError } },
        _internal: { generateCallId: () => 'test-call-id' },
      }),
    ).rejects.toBe(error);

    expect(onError).toHaveBeenCalledWith({
      callId: 'test-call-id',
      error,
    });
  });
});
