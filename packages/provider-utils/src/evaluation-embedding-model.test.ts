import {
  InvalidArgumentError,
  InvalidResponseDataError,
  type EmbeddingModelV4,
} from '@ai-sdk/provider';
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from '@workflow/serde';
import { expect, it, vi } from 'vitest';
import { EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL } from './embedding-model-capabilities';
import { EvaluationEmbeddingModel } from './evaluation-embedding-model';

const options = {
  state: 'charged twice',
  questions: {
    department: {
      type: 'choice',
      instructions: 'Select a department',
      criteria: { 'Needs Review': 'Bugs', 'Needs review': 'Charges' },
    },
  },
} as const;

function setup(overrides: Partial<EmbeddingModelV4> = {}) {
  const doEmbed = vi
    .fn<EmbeddingModelV4['doEmbed']>()
    .mockImplementation(async ({ values }) => ({
      embeddings: values.map(value =>
        value.includes('Bugs') ? [0, 20] : [2, 0],
      ),
      usage: { tokens: values.length },
      warnings: [],
      response: {
        headers: { 'x-request-id': 'test' },
        body: { original: true },
      },
      providerMetadata: { test: { original: true } },
    }));
  const embeddingModel: EmbeddingModelV4 = {
    specificationVersion: 'v4',
    provider: 'test.embedding',
    modelId: 'embedding-id',
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: false,
    doEmbed,
    ...overrides,
  };
  const model = new EvaluationEmbeddingModel({ model: embeddingModel });
  return { model, embeddingModel, doEmbed };
}

it('normalizes vectors, preserves exact keys, and does not invent probabilities', async () => {
  const { model, doEmbed } = setup();
  expect(await model.doEvaluate(options)).toEqual({
    answers: { department: { type: 'choice', choice: 'Needs review' } },
    usage: { inputTokens: 3, outputTokens: 0 },
    warnings: [],
    response: { headers: { 'x-request-id': 'test' }, body: { original: true } },
    providerMetadata: { test: { original: true } },
  });
  expect(doEmbed).toHaveBeenCalledTimes(1);
  expect(model.modelId).toBe('embedding-id');
  expect(model.supportedQuestionTypes).toEqual(['choice']);
});

it('uses cosine similarity rather than raw vector magnitude', async () => {
  const { model, doEmbed } = setup();
  doEmbed.mockResolvedValue({
    embeddings: [
      [1, 2],
      [20, 0],
      [1, 1],
    ],
    warnings: [],
  });
  expect((await model.doEvaluate(options)).answers.department).toEqual({
    type: 'choice',
    choice: 'Needs review',
  });
});

it('shares matching state encodings across questions and reuses bounded criteria across calls', async () => {
  const { model, doEmbed } = setup();
  const questions = {
    ...options.questions,
    other: options.questions.department,
  };
  await model.doEvaluate({ ...options, questions });
  expect(doEmbed.mock.calls[0][0].values).toHaveLength(3);
  await model.doEvaluate({ ...options, state: 'new state', questions });
  expect(doEmbed.mock.calls[1][0].values).toEqual([
    JSON.stringify({
      instructions: 'Select a department',
      content: 'new state',
    }),
  ]);
});

it('keeps structured content and instructions, and uses a label for null descriptions', async () => {
  const { embeddingModel, doEmbed } = setup();
  const model = new EvaluationEmbeddingModel({
    model: embeddingModel,
    inputPrefix: 'task: classification | query: ',
  });
  await model.doEvaluate({
    state: [{ text: 'Charges' }],
    questions: {
      topic: {
        type: 'choice',
        instructions: { task: ['Pick a category'] },
        criteria: {
          automatic: ['Bugs'],
          manual: { meaning: 'Charges' },
          unknown: null,
        },
      },
    },
  });
  const values = doEmbed.mock.calls[0][0].values.map(value =>
    JSON.parse(value.slice('task: classification | query: '.length)),
  );
  expect(values).toEqual([
    {
      instructions: { task: ['Pick a category'] },
      content: [{ text: 'Charges' }],
    },
    { instructions: { task: ['Pick a category'] }, content: ['Bugs'] },
    {
      instructions: { task: ['Pick a category'] },
      content: { meaning: 'Charges' },
    },
    { instructions: { task: ['Pick a category'] }, content: 'unknown' },
  ]);
});

it('invalidates criteria for changed instructions, descriptions, options, and headers', async () => {
  const { model, doEmbed } = setup();
  await model.doEvaluate(options);
  await model.doEvaluate({
    ...options,
    providerOptions: { test: { dimensions: 2 } },
  });
  await model.doEvaluate({ ...options, headers: { 'x-tenant': 'other' } });
  await model.doEvaluate({
    ...options,
    questions: {
      department: {
        ...options.questions.department,
        instructions: 'Changed',
        criteria: { only: 'New description' },
      },
    },
  });
  expect(doEmbed.mock.calls.map(([call]) => call.values.length)).toEqual([
    3, 3, 3, 2,
  ]);
});

it('preserves new label keys and reordered criteria with a warm cache', async () => {
  const { model, doEmbed } = setup();
  await model.doEvaluate(options);
  const result = await model.doEvaluate({
    ...options,
    questions: {
      ['__proto__']: {
        ...options.questions.department,
        criteria: { newBilling: 'Charges', newTech: 'Bugs' },
      },
    },
  });
  expect(result.answers).toEqual({
    ['__proto__']: { type: 'choice', choice: 'newBilling' },
  });
  expect(doEmbed.mock.calls[1][0].values).toHaveLength(1);
});

it('merges provider defaults and forwards cancellation and headers', async () => {
  const { embeddingModel, doEmbed } = setup();
  const model = new EvaluationEmbeddingModel({
    model: embeddingModel,
    providerOptions: { test: { task: 'classification', dimensions: 2 } },
  });
  const abortSignal = new AbortController().signal;
  const headers = { 'x-call': 'test' };
  await model.doEvaluate({
    ...options,
    abortSignal,
    headers,
    providerOptions: { test: { dimensions: 3 }, other: { value: true } },
  });
  expect(doEmbed.mock.calls[0][0]).toMatchObject({
    abortSignal,
    headers,
    providerOptions: {
      test: { task: 'classification', dimensions: 3 },
      other: { value: true },
    },
  });
});

it.each(['boolean', 'score'] as const)(
  'rejects mixed %s calls before I/O',
  async type => {
    const { model, doEmbed } = setup();
    await expect(
      model.doEvaluate({
        ...options,
        questions: {
          ...options.questions,
          unsupported:
            type === 'score'
              ? { type, instructions: 'Evaluate', criteria: ['low', 'high'] }
              : { type, instructions: 'Evaluate' },
        },
      }),
    ).rejects.toMatchObject({
      name: 'AI_EvaluationUnsupportedQuestionTypeError',
      questionId: 'unsupported',
      questionType: type,
    });
    expect(doEmbed).not.toHaveBeenCalled();
  },
);

it.each<Parameters<EvaluationEmbeddingModel['doEvaluate']>[0]['questions']>([
  {},
  { department: { type: 'choice', instructions: 'test', criteria: {} } },
])('rejects empty questions or criteria', async questions => {
  const { model, doEmbed } = setup();
  await expect(
    model.doEvaluate({ state: 'test', questions }),
  ).rejects.toBeInstanceOf(InvalidArgumentError);
  expect(doEmbed).not.toHaveBeenCalled();
});

it('breaks exact ties by criteria order', async () => {
  const { model, doEmbed } = setup();
  doEmbed.mockResolvedValue({
    embeddings: [
      [1, 1],
      [1, 0],
      [0, 1],
    ],
    warnings: [],
  });
  expect((await model.doEvaluate(options)).answers.department).toEqual({
    type: 'choice',
    choice: 'Needs Review',
  });
});

it.each(
  [
    [],
    [[1, 0]],
    [[1, 0], [1, 0], []],
    [
      [1, 0],
      [1, 0],
      [0, 0],
    ],
    [
      [1, 0],
      [1, 0],
      [NaN, 1],
    ],
    [
      [1, 0],
      [1, 0],
      [Infinity, 1],
    ],
    [
      [1, 0],
      [1, 0],
      [1, 0, 1],
    ],
  ].map(embeddings => ({ embeddings })),
)('rejects malformed embedding vectors %#', async ({ embeddings }) => {
  const { model, doEmbed } = setup();
  doEmbed.mockResolvedValue({ embeddings, warnings: [] });
  await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
    InvalidResponseDataError,
  );
});

it('batches within asynchronous count limits and aggregates usage and warnings', async () => {
  const { model, doEmbed } = setup({
    maxEmbeddingsPerCall: Promise.resolve(2),
  });
  doEmbed.mockImplementation(async ({ values }) => ({
    embeddings: values.map(() => [1, 0]),
    usage: { tokens: 5 },
    warnings: [{ type: 'other', message: 'warning' }],
  }));
  const result = await model.doEvaluate(options);
  expect(doEmbed.mock.calls.map(([call]) => call.values.length)).toEqual([
    2, 1,
  ]);
  expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 0 });
  expect(result.warnings).toHaveLength(2);
});

it('respects UTF-8 request byte budgets', async () => {
  const { embeddingModel, doEmbed } = setup();
  Object.assign(embeddingModel, {
    [EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]: 100,
  });
  await new EvaluationEmbeddingModel({ model: embeddingModel }).doEvaluate(
    options,
  );
  expect(doEmbed.mock.calls).toHaveLength(3);
});

it('does not report zero tokens when any batch omits usage', async () => {
  const { model, doEmbed } = setup({ maxEmbeddingsPerCall: 2 });
  doEmbed.mockResolvedValueOnce({
    embeddings: [
      [1, 0],
      [0, 1],
    ],
    warnings: [],
  });
  expect((await model.doEvaluate(options)).usage).toEqual({
    inputTokens: undefined,
    outputTokens: 0,
  });
});

it('never caches failed or cancelled requests and leaves retries to core', async () => {
  const { model, doEmbed } = setup({ maxEmbeddingsPerCall: 2 });
  const failure = new Error('retryable');
  doEmbed
    .mockResolvedValueOnce({
      embeddings: [
        [1, 0],
        [0, 1],
      ],
      warnings: [],
    })
    .mockRejectedValueOnce(failure);
  await expect(model.doEvaluate(options)).rejects.toBe(failure);
  expect(doEmbed).toHaveBeenCalledTimes(2);
  await model.doEvaluate(options);
  expect(
    doEmbed.mock.calls.slice(2).flatMap(([call]) => call.values),
  ).toHaveLength(3);
});

it('checks cancellation before and after embedding requests', async () => {
  const { model, doEmbed } = setup();
  const reason = new Error('cancelled');
  await expect(
    model.doEvaluate({ ...options, abortSignal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(doEmbed).not.toHaveBeenCalled();
  const controller = new AbortController();
  doEmbed.mockImplementationOnce(async ({ values }) => {
    controller.abort(reason);
    return { embeddings: values.map(() => [1, 0]), warnings: [] };
  });
  await expect(
    model.doEvaluate({ ...options, abortSignal: controller.signal }),
  ).rejects.toBe(reason);
});

it('limits criterion caching to 256 entries', async () => {
  const { model, doEmbed } = setup({ maxEmbeddingsPerCall: Infinity });
  const criteria = Object.fromEntries(
    Array.from({ length: 257 }, (_, index) => [
      `label${index}`,
      `criterion${index}`,
    ]),
  );
  await model.doEvaluate({
    ...options,
    questions: { department: { ...options.questions.department, criteria } },
  });
  await model.doEvaluate({
    ...options,
    questions: {
      department: {
        ...options.questions.department,
        criteria: { first: 'criterion0' },
      },
    },
  });
  expect(doEmbed.mock.calls[1][0].values).toHaveLength(2);
});

it('serializes configuration without criterion caches', async () => {
  const { model, doEmbed } = setup();
  await model.doEvaluate(options);
  const serialized = EvaluationEmbeddingModel[WORKFLOW_SERIALIZE](model);
  expect(Object.keys(serialized)).toEqual([
    'model',
    'provider',
    'inputPrefix',
    'providerOptions',
  ]);
  const restored = EvaluationEmbeddingModel[WORKFLOW_DESERIALIZE](serialized);
  await restored.doEvaluate(options);
  expect(doEmbed.mock.calls[1][0].values).toHaveLength(3);
});

it('isolates concurrent calls with different provider settings', async () => {
  const { model, doEmbed } = setup();
  let finishFirst!: (
    result: Awaited<ReturnType<EmbeddingModelV4['doEmbed']>>,
  ) => void;
  doEmbed.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishFirst = resolve;
      }),
  );
  const first = model.doEvaluate(options);
  await vi.waitFor(() => expect(finishFirst).toBeDefined());
  await model.doEvaluate({
    ...options,
    providerOptions: { test: { dimensions: 2 } },
  });
  finishFirst({
    embeddings: [
      [1, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
    ],
    warnings: [],
  });
  await first;
  await model.doEvaluate({
    ...options,
    providerOptions: { test: { dimensions: 2 } },
  });
  expect(doEmbed.mock.calls[2][0].values).toHaveLength(1);
});
