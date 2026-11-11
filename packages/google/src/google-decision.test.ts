import {
  APICallError,
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4Question as DecisionQuestion,
} from '@ai-sdk/provider';
import {
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { DecisionGoogleModel } from './google-decision-model';
import { createGoogle } from './google-provider';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decision.json', 'utf8'),
);
const options = {
  state: [
    { type: 'json', value: { message: 'A billing issue with a workaround.' } },
  ],
  questions: {
    department: {
      type: 'choice',
      instructions: 'Pick the team.',
      criteria: { technical: 'Bugs', billing: 'Charges' },
    },
    severity: {
      type: 'score',
      instructions: ['Rate severity.'],
      criteria: ['Low', 'Medium', 'High'],
    },
    requestsRefund: { type: 'boolean', instructions: 'Is a refund requested?' },
  },
} as const;

function setup(body: unknown = fixture, status = 200) {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-test',
        },
      }),
  );
  const provider = createGoogle({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1beta/',
    headers: { 'x-provider': 'configured' },
    fetch,
  });
  return {
    model: provider.decisionModel('gemini-decision-1'),
    provider,
    fetch,
  };
}

it('calls Decisions directly with all three question types and preserves native probabilities', async () => {
  const { model, fetch } = setup();
  const abortSignal = new AbortController().signal;
  const result = await model.doDecide({
    ...options,
    abortSignal,
    headers: { 'x-call': 'forwarded' },
  });
  expect(model.provider).toBe('google.decision');
  expect(model.modelId).toBe('gemini-decision-1');
  expect(model.specificationVersion).toBe('v4');
  expect(model.supportedQuestionTypes).toEqual(['choice', 'score', 'boolean']);
  expect(result.answers).toEqual({
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: {
        billing: 0.8624268048164867,
        technical: 0.13757319518351327,
      },
    },
    severity: {
      type: 'score',
      score: 0.8093588003103453,
      probabilities: {
        '0': 0.3028687295463396,
        '1': 0.5849037405969755,
        '2': 0.11222752985668494,
      },
    },
    requestsRefund: { type: 'boolean', probability: 0.36248188111145113 },
  });
  expect(result.usage).toEqual({ inputTokens: 193, outputTokens: 0 });
  expect(result.warnings).toEqual([]);
  expect(result.response).toEqual({
    modelId: 'gemini-decision-1',
    headers: expect.objectContaining({ 'x-request-id': 'req-test' }),
    body: fixture,
  });
  expect(result.providerMetadata).toEqual({
    google: {
      confidence: {
        department: 0.8624268048164867,
        severity: 0.5849037405969755,
        requestsRefund: 0.6375181188885488,
      },
      legend: { severity: { '0': 'Low', '1': 'Medium', '2': 'High' } },
      usage: fixture.usage,
    },
  });
  expect(fetch).toHaveBeenCalledOnce();
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1beta/decisions');
  expect(request.signal).toBe(abortSignal);
  const headers = new Headers(request.headers);
  expect(headers.get('x-goog-api-key')).toBe('test-key');
  expect(headers.get('x-provider')).toBe('configured');
  expect(headers.get('x-call')).toBe('forwarded');
  expect(headers.get('user-agent')).toContain('ai-sdk-google/');
  expect(JSON.parse(request.body)).toEqual({
    model: 'gemini-decision-1',
    input: [{ type: 'text', text: JSON.stringify(options.state[0].value) }],
    questions: {
      department: options.questions.department,
      severity: {
        ...options.questions.severity,
        instructions: '["Rate severity."]',
      },
      requestsRefund: { type: 'noul', instructions: 'Is a refund requested?' },
    },
  });
});

it('serializes structured instructions and criteria without changing their data', async () => {
  const { model, fetch } = setup();
  await model.doDecide({
    ...options,
    questions: {
      department: {
        type: 'choice',
        instructions: { task: 'Pick a team' },
        criteria: { billing: { handles: ['payments'] }, technical: null },
      },
      severity: {
        type: 'score',
        instructions: 'Rate severity',
        criteria: [{ level: 'low' }, ['medium'], 'high'],
      },
      requestsRefund: {
        type: 'boolean',
        instructions: 'Refund?',
        criteria: {
          true: { requests: 'money back' },
          false: ['No refund needed'],
        },
      },
    },
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body).questions).toEqual({
    department: {
      type: 'choice',
      instructions: '{"task":"Pick a team"}',
      criteria: { billing: '{"handles":["payments"]}', technical: null },
    },
    severity: {
      type: 'score',
      instructions: 'Rate severity',
      criteria: ['{"level":"low"}', '["medium"]', 'high'],
    },
    requestsRefund: {
      type: 'noul',
      instructions: 'Refund?',
      criteria: {
        true_description: '{"requests":"money back"}',
        false_description: '["No refund needed"]',
      },
    },
  });
});

it('omits null boolean descriptions', async () => {
  const { model, fetch } = setup();
  await model.doDecide({
    ...options,
    questions: {
      ...options.questions,
      requestsRefund: {
        type: 'boolean',
        instructions: 'Refund?',
        criteria: { true: 'Money back', false: null },
      },
    },
  });
  expect(
    JSON.parse(fetch.mock.calls[0][1].body).questions.requestsRefund.criteria,
  ).toEqual({ true_description: 'Money back' });
});

it('warns about generation settings instead of sending them to Decisions', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    maxOutputTokens: 100,
    reasoning: 'high',
    providerOptions: {
      google: {
        thinkingConfig: { thinkingLevel: 'high' },
        cachedContent: 'cache-id',
      },
    },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.google.thinkingConfig' },
    { type: 'unsupported', feature: 'providerOptions.google.cachedContent' },
  ]);
  expect(Object.keys(JSON.parse(fetch.mock.calls[0][1].body))).toEqual([
    'model',
    'input',
    'questions',
  ]);
});

it('sends text, JSON, images, audio, video, and PDF state in order', async () => {
  const { model, fetch } = setup();
  await model.doDecide({
    ...options,
    state: [
      { type: 'text', text: 'Check these files.' },
      { type: 'json', value: { type: 'image', user: 'data' } },
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      },
      {
        type: 'file',
        mediaType: 'audio/mp3',
        data: { type: 'url', url: new URL('https://example.com/clip.mp3') },
      },
      {
        type: 'file',
        mediaType: 'video/mp4',
        data: { type: 'data', data: 'AQID' },
      },
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: { type: 'data', data: 'BAUG' },
      },
    ],
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body).input).toEqual([
    { type: 'text', text: 'Check these files.' },
    { type: 'text', text: '{"type":"image","user":"data"}' },
    { type: 'image', mime_type: 'image/png', data: 'AQID' },
    {
      type: 'audio',
      mime_type: 'audio/mp3',
      uri: 'https://example.com/clip.mp3',
    },
    { type: 'video', mime_type: 'video/mp4', data: 'AQID' },
    { type: 'document', mime_type: 'application/pdf', data: 'BAUG' },
  ]);
});

it('returns refusals for all questions when input is safety blocked', async () => {
  const prompt_feedback = {
    block_reason: 'SAFETY',
    block_reason_message: 'Blocked input.',
  };
  const { model } = setup({ prompt_feedback, usage: fixture.usage });
  const result = await model.doDecide(options);
  expect(result.answers).toEqual({
    department: { type: 'refusal' },
    severity: { type: 'refusal' },
    requestsRefund: { type: 'refusal' },
  });
  expect(result.providerMetadata?.google.promptFeedback).toEqual(
    prompt_feedback,
  );
  expect(result.usage).toEqual({ inputTokens: 193, outputTokens: 0 });
});

it.each([
  { label: 'missing answers', body: {} },
  { label: 'empty answers', body: { answers: {} } },
  {
    label: 'missing question',
    body: { answers: { department: fixture.answers.department } },
  },
  {
    label: 'extra question',
    body: {
      answers: { ...fixture.answers, extra: { type: 'noul', noul: 0.5 } },
    },
  },
  {
    label: 'wrong question ID',
    body: {
      answers: {
        ...fixture.answers,
        requestsRefund: undefined,
        wrong: fixture.answers.requestsRefund,
      },
    },
  },
  {
    label: 'mismatched type',
    body: {
      answers: {
        ...fixture.answers,
        requestsRefund: fixture.answers.department,
      },
    },
  },
  {
    label: 'unknown choice',
    body: {
      answers: {
        ...fixture.answers,
        department: { ...fixture.answers.department, choice: 'unknown' },
      },
    },
  },
  {
    label: 'out-of-bounds score',
    body: {
      answers: {
        ...fixture.answers,
        severity: { ...fixture.answers.severity, score: 3 },
      },
    },
  },
])('rejects $label', async ({ body }) => {
  const { model } = setup(body);
  await expect(model.doDecide(options)).rejects.toBeInstanceOf(
    InvalidResponseDataError,
  );
});

it.each([-0.1, 1.1])(
  'rejects an invalid boolean probability (%s)',
  async noul => {
    const { model } = setup({
      answers: { ...fixture.answers, requestsRefund: { type: 'noul', noul } },
    });
    await expect(model.doDecide(options)).rejects.toBeInstanceOf(APICallError);
  },
);

it('accepts absent optional response metadata', async () => {
  const { model } = setup({
    answers: {
      department: { ...fixture.answers.department, confidence: null },
      severity: { ...fixture.answers.severity, confidence: null, legend: null },
      requestsRefund: { type: 'noul', noul: 0.02, confidence: null },
    },
    usage: null,
    prompt_feedback: null,
  });
  const result = await model.doDecide(options);
  expect(result.usage).toBeUndefined();
  expect(result.providerMetadata).toEqual({
    google: { confidence: {}, legend: {} },
  });
});

it.each<DecisionQuestion>([
  { type: 'choice', instructions: 'Choose', criteria: { only: null } },
  {
    type: 'choice',
    instructions: 'Choose',
    criteria: Object.fromEntries(
      Array.from({ length: 256 }, (_, i) => [`c${i}`, null]),
    ),
  },
  { type: 'score', instructions: 'Rate', criteria: ['One'] },
  { type: 'score', instructions: 'Rate', criteria: Array(256).fill('Level') },
  { type: 'score', instructions: 'Rate', criteria: ['Low', null] },
  { type: 'score', instructions: 'Rate', criteria: ['Low', ''] },
  { type: 'boolean', criteria: { true: 'Yes' } },
])(
  'rejects unsupported rubric constraints before sending a request (%j)',
  async question => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({ state: options.state, questions: { question } }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('rejects empty questions before sending a request', async () => {
  const { model, fetch } = setup();
  await expect(
    model.doDecide({ ...options, questions: {} }),
  ).rejects.toBeInstanceOf(InvalidArgumentError);
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects Box before sending a request', async () => {
  const { model, fetch } = setup();
  await expect(
    model.doDecide({
      ...options,
      questions: { box: { type: 'box', instructions: 'Find a box' } },
    }),
  ).rejects.toBeInstanceOf(DecisionUnsupportedQuestionTypeError);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['text/plain', 'application/octet-stream'])(
  'rejects unsupported media (%s)',
  async mediaType => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({
        ...options,
        state: [
          { type: 'file', mediaType, data: { type: 'data', data: 'AQID' } },
        ],
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('rejects file references before sending a request', async () => {
  const { model, fetch } = setup();
  await expect(
    model.doDecide({
      ...options,
      state: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'reference', reference: { google: 'files/image' } },
        },
      ],
    }),
  ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects an aborted decision without a request', async () => {
  const { model, fetch } = setup();
  const reason = new Error('cancelled');
  await expect(
    model.doDecide({ ...options, abortSignal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(fetch).not.toHaveBeenCalled();
});

it('uses Google API error handling without falling back to generateContent', async () => {
  const { model, fetch } = setup(
    {
      error: {
        code: 403,
        message: 'EAP access required',
        status: 'PERMISSION_DENIED',
      },
    },
    403,
  );
  await expect(model.doDecide(options)).rejects.toMatchObject({
    message: 'EAP access required',
    statusCode: 403,
  });
  expect(fetch).toHaveBeenCalledOnce();
});

it('preserves the deprecated factory and direct model method', async () => {
  const { provider, fetch } = setup();
  expect(provider.evaluationModel).toBe(provider.decisionModel);
  const result = await provider
    .evaluationModel('gemini-decision-1')
    .doEvaluate(options);
  expect(result.answers.department).toMatchObject({
    type: 'choice',
    choice: 'billing',
  });
  expect(fetch.mock.calls[0][0]).toBe('https://example.com/v1beta/decisions');
});

it('preserves custom provider names and default API version', async () => {
  const { fetch } = setup();
  const model = createGoogle({
    apiKey: 'test-key',
    name: 'custom.generative-ai',
    fetch,
  }).decisionModel('custom-model');
  await model.doDecide(options);
  expect(model.provider).toBe('custom.decision');
  expect(fetch.mock.calls[0][0]).toBe(
    'https://generativelanguage.googleapis.com/v1beta/decisions',
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('custom-model');
});

it('preserves workflow serialization', () => {
  const { model } = setup();
  const serialized = DecisionGoogleModel[WORKFLOW_SERIALIZE](
    model as DecisionGoogleModel,
  );
  const restored = DecisionGoogleModel[WORKFLOW_DESERIALIZE](
    serialized as unknown as Parameters<
      (typeof DecisionGoogleModel)[typeof WORKFLOW_DESERIALIZE]
    >[0],
  );
  expect(restored.modelId).toBe(model.modelId);
  expect(restored.provider).toBe(model.provider);
  expect(serialized.config).not.toHaveProperty('fetch');
  expect(serialized.config.headers).toMatchObject({
    'x-goog-api-key': 'test-key',
    'x-provider': 'configured',
  });
});
