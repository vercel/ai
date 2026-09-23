import {
  APICallError,
  InvalidArgumentError,
  InvalidResponseDataError,
  type Experimental_EvaluationModelV4CallOptions as EvaluationModelV4CallOptions,
  type LanguageModelV4,
  type LanguageModelV4GenerateResult,
} from '@ai-sdk/provider';
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from '@workflow/serde';
import { expect, it, vi } from 'vitest';
import { EvaluationLanguageModel } from './evaluation-language-model';

const questions = {
  category: {
    type: 'choice',
    instructions: { task: ['Pick the exact label'] },
    criteria: {
      'Needs Review': { meaning: 'manual' },
      'Needs review': ['automatic'],
      other: null,
    },
  },
  severity: {
    type: 'score',
    instructions: ['Rate the impact'],
    criteria: ['low', { meaning: 'medium' }, null],
  },
} as const;
const options = { state: { text: 'test', events: [1, null] }, questions };
function setup(overrides: Partial<LanguageModelV4GenerateResult> = {}) {
  const result: LanguageModelV4GenerateResult = {
    content: [{ type: 'text', text: '{"q1":1.25,"q0":"c1"}' }],
    finishReason: { unified: 'stop', raw: 'end' },
    usage: {
      inputTokens: { total: 20, noCache: 15, cacheRead: 5, cacheWrite: 0 },
      outputTokens: { total: 12, text: 8, reasoning: 4 },
    },
    warnings: [{ type: 'other', message: 'test warning' }],
    providerMetadata: { test: { original: true } },
    response: {
      id: 'response',
      modelId: 'resolved',
      timestamp: new Date(0),
      headers: { 'x-request-id': 'id' },
      body: { raw: true },
    },
    ...overrides,
  };
  const doGenerate = vi
    .fn<LanguageModelV4['doGenerate']>()
    .mockResolvedValue(result);
  const languageModel: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'test.language',
    modelId: 'test-model',
    supportedUrls: {},
    doGenerate,
    doStream: vi.fn(),
  };
  return {
    model: new EvaluationLanguageModel({
      model: languageModel,
      provider: 'test.evaluation',
    }),
    doGenerate,
    languageModel,
    result,
  };
}

it('maps exact caller labels and fractional scores without inventing distributions', async () => {
  const { model, doGenerate } = setup();
  expect(await model.doEvaluate(options)).toMatchObject({
    answers: {
      category: { type: 'choice', choice: 'Needs review' },
      severity: { type: 'score', score: 1.25 },
    },
  });
  expect(doGenerate).toHaveBeenCalledTimes(1);
});
it('uses a portable flat schema with required fields and internal option codes', async () => {
  const { model, doGenerate } = setup();
  await model.doEvaluate(options);
  const call = doGenerate.mock.calls[0][0];
  expect(call.responseFormat).toEqual({
    type: 'json',
    name: 'evaluation',
    schema: {
      type: 'object',
      properties: {
        q0: { type: 'string', enum: ['c0', 'c1', 'c2'] },
        q1: { type: 'number', description: expect.stringContaining('0 to 2') },
      },
      required: ['q0', 'q1'],
      additionalProperties: false,
    },
  });
  const message = call.prompt[1];
  if (message.role !== 'user' || message.content[0].type !== 'text')
    throw new Error('Expected text');
  expect(JSON.parse(message.content[0].text)).toEqual({
    state: options.state,
    questions: {
      q0: {
        id: 'category',
        type: 'choice',
        instructions: questions.category.instructions,
        criteria: {
          c0: { label: 'Needs Review', description: { meaning: 'manual' } },
          c1: { label: 'Needs review', description: ['automatic'] },
          c2: { label: 'other', description: null },
        },
      },
      q1: { id: 'severity', ...questions.severity },
    },
  });
  expect(call).not.toHaveProperty('temperature');
  expect(call).not.toHaveProperty('tools');
  expect(call.reasoning).toBe('none');
});
it('preserves usage, response, warnings, and provider metadata', async () => {
  const { model, result } = setup();
  const output = await model.doEvaluate(options);
  expect(output.usage).toEqual({ inputTokens: 20, outputTokens: 12 });
  expect(output.warnings).toBe(result.warnings);
  expect(output.response).toBe(result.response);
  expect(output.providerMetadata).toBe(result.providerMetadata);
});
it('forwards cancellation, headers, and provider options unchanged', async () => {
  const { model, doGenerate } = setup();
  const abortSignal = new AbortController().signal;
  const headers = { test: 'header' };
  const providerOptions = { test: { reasoning: 'low' } };
  await model.doEvaluate({ ...options, abortSignal, headers, providerOptions });
  expect(doGenerate.mock.calls[0][0]).toMatchObject({
    reasoning: 'none',
    abortSignal,
    headers,
    providerOptions,
  });
});
it.each([0, 0.02, 0.5, 0.98, 1])(
  'preserves Boolean P(true) %s without thresholding in a mixed evaluation',
  async probability => {
    const { model, doGenerate } = setup({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ q2: probability, q1: 1.25, q0: 'c1' }),
        },
      ],
    });
    const flag = {
      type: 'boolean',
      instructions: { task: ['Is a refund requested?'] },
      criteria: {
        true: { meaning: 'A refund is requested' },
        false: ['No refund requested'],
      },
    } as const;
    const result = await model.doEvaluate({
      ...options,
      questions: { ...questions, flag },
    });
    expect(model.supportedQuestionTypes).toEqual([
      'choice',
      'score',
      'boolean',
    ]);
    expect(result.answers).toEqual({
      category: { type: 'choice', choice: 'Needs review' },
      severity: { type: 'score', score: 1.25 },
      flag: { type: 'boolean', probability },
    });
    expect(doGenerate).toHaveBeenCalledTimes(1);
    const call = doGenerate.mock.calls[0][0];
    expect(call.responseFormat).toMatchObject({
      schema: {
        properties: {
          q2: {
            type: 'number',
            description: expect.stringContaining('probability'),
          },
        },
        required: ['q0', 'q1', 'q2'],
      },
    });
    expect(
      call.responseFormat?.type === 'json' &&
        call.responseFormat.schema?.properties?.q2,
    ).not.toHaveProperty('minimum');
    expect(
      call.responseFormat?.type === 'json' &&
        call.responseFormat.schema?.properties?.q2,
    ).not.toHaveProperty('maximum');
    const message = call.prompt[1];
    if (message.role !== 'user' || message.content[0].type !== 'text')
      throw new Error('Expected text');
    expect(JSON.parse(message.content[0].text).questions.q2).toEqual({
      id: 'flag',
      ...flag,
    });
    expect(call.prompt[0]).toMatchObject({
      content: expect.stringContaining('not confidence in whichever outcome'),
    });
  },
);
it('supports Boolean questions without criteria', async () => {
  const { model } = setup({ content: [{ type: 'text', text: '{"q0":0.25}' }] });
  expect(
    (
      await model.doEvaluate({
        state: 'test',
        questions: { flag: { type: 'boolean', instructions: 'Yes?' } },
      })
    ).answers,
  ).toEqual({ flag: { type: 'boolean', probability: 0.25 } });
});
it.each([
  '-0.01',
  '1.01',
  '1e999',
  '-1e999',
  'null',
  'true',
  'false',
  '"0.5"',
  '{}',
  '[]',
])(
  'rejects invalid Boolean probability %s without returning partial answers',
  async value => {
    const { model } = setup({
      content: [{ type: 'text', text: `{"q0":"c1","q1":1.25,"q2":${value}}` }],
    });
    await expect(
      model.doEvaluate({
        ...options,
        questions: {
          ...questions,
          flag: { type: 'boolean', instructions: 'Yes?' },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  },
);
it.each([
  '{"q0":"c1","q1":1.25}',
  '{"q0":"c1","q1":1.25,"q2":0.5,"extra":0.5}',
])(
  'rejects missing or extra answers for mixed Boolean evaluations: %s',
  async text => {
    const { model } = setup({ content: [{ type: 'text', text }] });
    await expect(
      model.doEvaluate({
        ...options,
        questions: {
          ...questions,
          flag: { type: 'boolean', instructions: 'Yes?' },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  },
);
it.each(['length', 'content-filter', 'tool-calls', 'error', 'other'] as const)(
  'rejects %s even with valid JSON',
  async unified => {
    const { model } = setup({ finishReason: { unified, raw: 'raw' } });
    await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
      InvalidResponseDataError,
    );
  },
);
it.each([
  '',
  'not JSON',
  '```json\n{}\n```',
  'null',
  '[]',
  '{}',
  '{"q0":"c1"}',
  '{"q0":"c1","q1":1,"extra":true}',
  '{"q0":"C1","q1":1}',
  '{"q0":"c01","q1":1}',
  '{"q0":"c3","q1":1}',
  '{"q0":"Needs review","q1":1}',
  '{"q0":1,"q1":1}',
  '{"q0":"c1","q1":"1"}',
  '{"q0":"c1","q1":-0.01}',
  '{"q0":"c1","q1":2.01}',
  '{"q0":"c1","q1":1e999}',
  '{"q0":"c1","q1":null}',
  '{"q0":"c1","q1":1,"__proto__":{}}',
])('rejects malformed evaluation output %s', async text => {
  const { model } = setup({ content: [{ type: 'text', text }] });
  await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
    InvalidResponseDataError,
  );
});
it('joins text parts and ignores reasoning', async () => {
  const { model } = setup({
    content: [
      { type: 'reasoning', text: 'internal' },
      { type: 'text', text: '{"q0":"c1",' },
      { type: 'text', text: '"q1":1}' },
    ],
  });
  expect((await model.doEvaluate(options)).answers.severity).toEqual({
    type: 'score',
    score: 1,
  });
});
it('preserves unusual IDs without using them as schema property names', async () => {
  const { model } = setup();
  const weird = Object.fromEntries([
    ['__proto__', questions.category],
    ['a.b [✓]', questions.severity],
  ]);
  const { answers } = await model.doEvaluate({ ...options, questions: weird });
  expect(Object.keys(answers)).toEqual(['__proto__', 'a.b [✓]']);
  expect(Object.prototype.hasOwnProperty.call(answers, '__proto__')).toBe(true);
});
it('does not retry or wrap language-model errors', async () => {
  const { model, doGenerate } = setup();
  const error = new APICallError({
    message: 'retry later',
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode: 429,
  });
  doGenerate.mockRejectedValue(error);
  await expect(model.doEvaluate(options)).rejects.toBe(error);
  expect(doGenerate).toHaveBeenCalledTimes(1);
});
it('rejects pre-aborted requests without invoking the model', async () => {
  const { model, doGenerate } = setup();
  const reason = new Error('abort');
  await expect(
    model.doEvaluate({ ...options, abortSignal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(doGenerate).not.toHaveBeenCalled();
});
it('checks cancellation after the model returns', async () => {
  const { model, doGenerate, result } = setup();
  const controller = new AbortController();
  const reason = new Error('abort');
  doGenerate.mockImplementation(async () => {
    controller.abort(reason);
    return result;
  });
  await expect(
    model.doEvaluate({ ...options, abortSignal: controller.signal }),
  ).rejects.toBe(reason);
});
it.each<EvaluationModelV4CallOptions['questions']>([
  {},
  { category: { ...questions.category, criteria: {} } },
  { severity: { ...questions.severity, criteria: ['only'] } },
])('rejects invalid rubric shapes before model I/O', async questions => {
  const { model, doGenerate } = setup();
  await expect(
    model.doEvaluate({ state: 'text', questions }),
  ).rejects.toBeInstanceOf(InvalidArgumentError);
  expect(doGenerate).not.toHaveBeenCalled();
});
it('restores the wrapped model and provider across workflow hooks', async () => {
  const { model, languageModel, doGenerate } = setup();
  const serialized = EvaluationLanguageModel[WORKFLOW_SERIALIZE](model);
  expect(serialized.model).toBe(languageModel);
  const restored = EvaluationLanguageModel[WORKFLOW_DESERIALIZE](serialized);
  await restored.doEvaluate(options);
  expect(restored.provider).toBe('test.evaluation');
  expect(restored.modelId).toBe('test-model');
  expect(doGenerate).toHaveBeenCalledTimes(1);
});
