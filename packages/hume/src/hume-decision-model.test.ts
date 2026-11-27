import {
  APICallError,
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  type Experimental_DecisionModelV4CallOptions as DecisionModelV4CallOptions,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecisionHumeModel } from './hume-decision-model';
import { createHume } from './hume-provider';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions.json', 'utf8'),
);

const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
const wav = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
]);

const options = {
  state: [
    {
      type: 'text',
      text: 'A short recorded reading about a historical scientist.',
    },
    {
      type: 'file',
      mediaType: 'audio/mpeg',
      data: { type: 'data', data: mp3 },
    },
  ],
  questions: {
    science: {
      type: 'boolean',
      instructions: 'Does the speaker talk about science or a scientist?',
      criteria: {
        true: 'The speaker discusses a scientist or scientific ideas.',
      },
    },
    delivery: {
      type: 'choice',
      instructions: 'Which best describes how the speaker delivers the text?',
      criteria: {
        reading: 'Reading from a prepared text',
        conversational: 'Speaking spontaneously in conversation',
        performing: null,
      },
    },
    clarity: {
      type: 'score',
      instructions: 'How clearly can the speaker be understood?',
      criteria: ['Hard to understand', 'Somewhat clear', 'Very clear'],
    },
  },
} as const satisfies DecisionModelV4CallOptions;

function setup(body: unknown = fixture, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'x-trace': 'trace-1' },
      }),
  );
  const provider = createHume({
    apiKey: 'test-key',
    baseURL: 'https://example.com/',
    headers: { 'x-provider': 'custom', shared: 'provider' },
    fetch,
  });
  return { model: provider.decisionModel('audio-decisions'), fetch };
}

async function requestParts(fetch: ReturnType<typeof setup>['fetch']) {
  const body = fetch.mock.calls[0][1]?.body as FormData;
  const file = body.get('file') as File;
  return {
    names: [...body.keys()],
    request: JSON.parse(await (body.get('request') as Blob).text()),
    file: {
      name: file.name,
      type: file.type,
      data: new Uint8Array(await file.arrayBuffer()),
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends one multipart request with the request part first and configured headers', async () => {
  const { model, fetch } = setup();
  await model.doDecide({ ...options, headers: { shared: 'call' } });
  expect(model).toMatchObject({
    specificationVersion: 'v4',
    provider: 'hume.decision',
    modelId: 'audio-decisions',
    supportedQuestionTypes: ['choice', 'score', 'boolean'],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v0/decisions/file');
  const headers = new Headers(request?.headers);
  expect(Object.fromEntries(headers)).toMatchObject({
    'x-hume-api-key': 'test-key',
    'x-provider': 'custom',
    shared: 'call',
  });
  expect(headers.get('user-agent')).toContain('ai-sdk-hume/');
  expect(await requestParts(fetch)).toEqual({
    names: ['request', 'file'],
    request: {
      context: 'A short recorded reading about a historical scientist.',
      questions: {
        science: {
          type: 'noul',
          instructions: options.questions.science.instructions,
          criteria: options.questions.science.criteria,
        },
        delivery: {
          type: 'choice',
          instructions: options.questions.delivery.instructions,
          criteria: [
            { name: 'reading', description: 'Reading from a prepared text' },
            {
              name: 'conversational',
              description: 'Speaking spontaneously in conversation',
            },
            { name: 'performing' },
          ],
        },
        clarity: options.questions.clarity,
      },
    },
    file: { name: 'audio.mp3', type: 'audio/mpeg', data: mp3 },
  });
});

it('maps answers and preserves confidence, legends, usage, rounding and response metadata', async () => {
  const result = await setup().model.doDecide(options);
  expect(result.answers).toEqual({
    science: { type: 'boolean', probability: fixture.answers.science.noul },
    delivery: {
      type: 'choice',
      choice: 'reading',
      probabilities: fixture.answers.delivery.probabilities,
    },
    clarity: {
      type: 'score',
      score: fixture.answers.clarity.score,
      probabilities: fixture.answers.clarity.probabilities,
    },
  });
  expect(result.rounding).toEqual({ probabilityDecimals: 4, scoreDecimals: 4 });
  expect(result.usage).toEqual({ inputTokens: 3179 });
  expect(result.warnings).toEqual([]);
  expect(result.providerMetadata).toEqual({
    hume: {
      confidence: {
        delivery: fixture.answers.delivery.confidence,
        clarity: fixture.answers.clarity.confidence,
      },
      legend: { clarity: fixture.answers.clarity.legend },
    },
  });
  expect(result.response).toMatchObject({
    id: fixture.run_id,
    modelId: 'audio-decisions',
    headers: { 'x-trace': 'trace-1' },
    body: fixture,
  });
});

it('tolerates absent ancillary response fields', async () => {
  const result = await setup({ answers: fixture.answers }).model.doDecide(
    options,
  );
  expect(result.usage).toBeUndefined();
  expect(result.response).toMatchObject({
    id: undefined,
    modelId: 'audio-decisions',
  });
});

it.each<[string, DecisionModelV4State, string | undefined, object]>([
  [
    'WAV audio detected from its data, without context',
    [{ type: 'file', mediaType: 'audio', data: { type: 'data', data: wav } }],
    undefined,
    { name: 'audio.wav', type: 'audio/wav', data: wav },
  ],
  [
    'base64 audio data with every text part joined as context',
    [
      { type: 'text', text: 'A recorded reading.' },
      {
        type: 'file',
        mediaType: 'audio/mpeg',
        data: { type: 'data', data: 'SUQzBA==' },
      },
      { type: 'text', text: 'The speaker is a narrator.' },
    ],
    'A recorded reading.\nThe speaker is a narrator.',
    { name: 'audio.mp3', type: 'audio/mpeg', data: mp3 },
  ],
])('sends %s', async (_, state, context, file) => {
  const { model, fetch } = setup({
    answers: { science: fixture.answers.science },
  });
  await model.doDecide({
    state,
    questions: { science: options.questions.science },
  });
  const parts = await requestParts(fetch);
  expect(parts.request.context).toBe(context);
  expect(parts.file).toEqual(file);
});

it.each<[string, DecisionModelV4State, new (...args: never[]) => Error]>([
  [
    'state without audio',
    [{ type: 'text', text: 'No recording.' }],
    InvalidArgumentError,
  ],
  [
    'more than one audio file',
    [options.state[1], options.state[1]],
    InvalidArgumentError,
  ],
  [
    'JSON state',
    [options.state[1], { type: 'json', value: { speaker: 'narrator' } }],
    UnsupportedFunctionalityError,
  ],
  [
    'non-audio media',
    [
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: 'iVBORw0KGgo=' },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'unsupported audio types',
    [
      {
        type: 'file',
        mediaType: 'audio/flac',
        data: { type: 'data', data: 'ZkxhQw==' },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'undetectable media types',
    [
      {
        type: 'file',
        mediaType: 'audio',
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'URL file data',
    [
      {
        type: 'file',
        mediaType: 'audio/mpeg',
        data: { type: 'url', url: new URL('https://example.com/a.mp3') },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'provider references',
    [
      {
        type: 'file',
        mediaType: 'audio/mpeg',
        data: { type: 'reference', reference: { hume: 'file-1' } },
      },
    ],
    UnsupportedFunctionalityError,
  ],
])('rejects %s before HTTP', async (_, state, error) => {
  const { model, fetch } = setup();
  await expect(model.doDecide({ ...options, state })).rejects.toBeInstanceOf(
    error,
  );
  expect(fetch).not.toHaveBeenCalled();
});

describe('request limits', () => {
  it.each<[string, DecisionModelV4CallOptions['questions']]>([
    ['no questions', {}],
    [
      'more than 20 questions',
      Object.fromEntries(
        Array.from({ length: 21 }, (_, i) => [
          String(i),
          options.questions.science,
        ]),
      ),
    ],
    [
      'missing instructions',
      { science: { type: 'boolean', criteria: { true: 'Science' } } },
    ],
    [
      'structured instructions',
      {
        science: {
          ...options.questions.science,
          instructions: { question: 'Science?' },
        },
      },
    ],
    [
      'structured criteria',
      {
        delivery: {
          ...options.questions.delivery,
          criteria: { reading: { style: 'prepared' }, conversational: null },
        },
      },
    ],
    [
      'a single Choice option',
      {
        delivery: {
          ...options.questions.delivery,
          criteria: { reading: null },
        },
      },
    ],
    [
      'more than 20 Choice options',
      {
        delivery: {
          ...options.questions.delivery,
          criteria: Object.fromEntries(
            Array.from({ length: 21 }, (_, i) => [String(i), null]),
          ),
        },
      },
    ],
    [
      'a single Score level',
      { clarity: { ...options.questions.clarity, criteria: ['Clear'] } },
    ],
    [
      'more than 10 Score levels',
      {
        clarity: {
          ...options.questions.clarity,
          criteria: Array.from({ length: 11 }, (_, i) => String(i)),
        },
      },
    ],
    [
      'null Score levels',
      { clarity: { ...options.questions.clarity, criteria: ['Clear', null] } },
    ],
  ])('rejects %s before HTTP', async (_, questions) => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({ ...options, questions }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects box questions before HTTP', async () => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({
        ...options,
        questions: { box: { type: 'box', instructions: 'Find the speaker' } },
      }),
    ).rejects.toBeInstanceOf(DecisionUnsupportedQuestionTypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts 20 questions', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => String(i));
    const { model, fetch } = setup({
      answers: Object.fromEntries(ids.map(id => [id, fixture.answers.science])),
    });
    await model.doDecide({
      ...options,
      questions: Object.fromEntries(
        ids.map(id => [id, options.questions.science]),
      ),
    });
    expect(
      Object.keys((await requestParts(fetch)).request.questions),
    ).toHaveLength(20);
  });

  it('omits Boolean criteria without descriptions', async () => {
    const { model, fetch } = setup({
      answers: { science: fixture.answers.science },
    });
    await model.doDecide({
      ...options,
      questions: {
        science: {
          type: 'boolean',
          instructions: 'Science?',
          criteria: { true: null, false: null },
        },
      },
    });
    expect((await requestParts(fetch)).request.questions).toEqual({
      science: { type: 'noul', instructions: 'Science?' },
    });
  });
});

it('warns about unsupported settings without adding fields to the request', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    maxOutputTokens: 10,
    reasoning: 'low',
    providerOptions: { hume: { temperature: 0 } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.hume.temperature' },
  ]);
  expect(Object.keys((await requestParts(fetch)).request)).toEqual([
    'context',
    'questions',
  ]);
});

it.each([
  {},
  { ...fixture.answers, extra: fixture.answers.science },
  { science: fixture.answers.science, clarity: fixture.answers.clarity },
])('rejects missing and unexpected answers', async answers => {
  await expect(
    setup({ answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(InvalidResponseDataError);
});

it.each([
  { ...fixture.answers, science: { type: 'noul', noul: 1.01 } },
  { ...fixture.answers, delivery: { type: 'choice', choice: 'reading' } },
  { ...fixture.answers, science: { type: 'span', spans: [] } },
])('rejects malformed native responses', async answers => {
  await expect(
    setup({ answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(APICallError);
});

it('preserves Hume error codes, parameters and request IDs', async () => {
  const result = Promise.resolve(
    setup(
      {
        type: 'error',
        code: 'question_invalid',
        message: 'score criteria must define at least 2 levels',
        param: '/questions/clarity/criteria',
        request_id: 'req_01JB8XA3C5RD',
      },
      400,
    ).model.doDecide(options),
  );
  await expect(result).rejects.toBeInstanceOf(APICallError);
  await expect(result).rejects.toMatchObject({
    message:
      'score criteria must define at least 2 levels (question_invalid) [/questions/clarity/criteria]',
    statusCode: 400,
    data: { request_id: 'req_01JB8XA3C5RD' },
  });
});

it('preserves Hume gateway error messages', async () => {
  const result = Promise.resolve(
    setup({ message: 'API rate limit exceeded' }, 429).model.doDecide(options),
  );
  await expect(result).rejects.toBeInstanceOf(APICallError);
  await expect(result).rejects.toMatchObject({
    message: 'API rate limit exceeded',
    statusCode: 429,
  });
});

it('restores the endpoint and authentication across workflow serialization', async () => {
  const { model, fetch } = setup();
  const serialized = DecisionHumeModel[WORKFLOW_SERIALIZE](
    model as DecisionHumeModel,
  );
  expect(serialized.config.fetch).toBeUndefined();
  vi.stubGlobal('fetch', fetch);
  const restored = DecisionHumeModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: serialized.config as unknown as Parameters<
      (typeof DecisionHumeModel)[typeof WORKFLOW_DESERIALIZE]
    >[0]['config'],
  });
  await restored.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe('https://example.com/v0/decisions/file');
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('x-hume-api-key'),
  ).toBe('test-key');
});
