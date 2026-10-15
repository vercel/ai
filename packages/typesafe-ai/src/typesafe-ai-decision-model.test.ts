import { readFileSync } from 'node:fs';
import { APICallError, InvalidArgumentError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypeSafeAi } from './typesafe-ai-provider';
import { DecisionTypeSafeAiModel } from './typesafe-ai-decision-model';
import { VERSION } from './version';

const nativeRequest = JSON.parse(
  readFileSync('src/__fixtures__/decision-request.json', 'utf8'),
);
const nativeResponse = JSON.parse(
  readFileSync('src/__fixtures__/decision-response.json', 'utf8'),
);
const questions = {
  ...nativeRequest.questions,
  requestsRefund: {
    ...nativeRequest.questions.requestsRefund,
    type: 'boolean' as const,
  },
};
const options = {
  state: [{ type: 'json' as const, value: nativeRequest.state }],
  questions,
};
const expectedRequest = {
  ...nativeRequest,
  state: nativeRequest.state,
};
const url = 'https://api.typesafe.ai/v1/systemone';
const provider = createTypeSafeAi({ apiKey: 'test-api-key' });
const model = provider.decisionModel('jev-latest');
const server = createTestServer({
  [url]: {},
  'https://custom.example/v1/systemone': {},
});

beforeEach(() => {
  server.urls[url].response = { type: 'json-value', body: nativeResponse };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends all three question types and structured rubrics in one request', async () => {
  await model.doDecide(options);
  expect(server.calls).toHaveLength(1);
  expect(await server.calls[0].requestBodyJson).toEqual(expectedRequest);
  expect(questions.requestsRefund.type).toBe('boolean');
  expect(server.calls[0].requestHeaders).toMatchObject({
    authorization: 'Bearer test-api-key',
    'content-type': 'application/json',
  });
});

it('preserves native scores, probabilities, confidence metadata, and usage', async () => {
  const result = await model.doDecide(options);
  expect(result.answers).toEqual({
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: { technical: 0, other: 0, billing: 1 },
    },
    severity: {
      type: 'score',
      score: 0.97,
      probabilities: { 0: 0.13, 1: 0.76, 2: 0.11 },
    },
    requestsRefund: { type: 'boolean', probability: 0.99 },
  });
  expect(result.rounding).toEqual({ probabilityDecimals: 2, scoreDecimals: 2 });
  expect(result.providerMetadata).toEqual({
    typesafe: { confidence: { department: 1, severity: 0.64 } },
  });
  expect(result.usage).toEqual({ inputTokens: 471, outputTokens: 71 });
  expect(result.response?.modelId).toBe('jev-1.13.0');
  expect(result.response?.body).toEqual(nativeResponse);
});

it('passes custom fetch, headers, base URL, and future model IDs', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(nativeResponse), {
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-id',
      },
    }),
  );
  const custom = createTypeSafeAi({
    apiKey: 'custom-key',
    baseURL: 'https://custom.example/v1/',
    fetch: fetchMock,
    headers: { custom: 'provider', shared: 'provider' },
  });
  const result = await custom
    .decisionModel('jev-future')
    .doDecide({ ...options, headers: { shared: 'call' } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [requestUrl, init] = fetchMock.mock.calls[0];
  expect(requestUrl).toBe('https://custom.example/v1/systemone');
  expect(new Headers(init?.headers).get('authorization')).toBe(
    'Bearer custom-key',
  );
  expect(new Headers(init?.headers).get('custom')).toBe('provider');
  expect(new Headers(init?.headers).get('shared')).toBe('call');
  expect(new Headers(init?.headers).get('user-agent')).toContain(
    `ai-sdk-typesafe-ai/${VERSION}`,
  );
  expect(JSON.parse(init?.body as string).model).toBe('jev-future');
  expect(result.response?.headers?.['x-request-id']).toBe('test-id');
});

it('loads TYPESAFE_AI_API_KEY lazily from the environment', async () => {
  const environmentModel = createTypeSafeAi().decisionModel('jev-latest');
  vi.stubEnv('TYPESAFE_AI_API_KEY', 'environment-key');
  await environmentModel.doDecide(options);
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer environment-key',
  );
});

it('reports unsupported provider options without passing them through', async () => {
  const result = await model.doDecide({
    ...options,
    providerOptions: { typesafe: { temperature: 0 } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'providerOptions.typesafe.temperature' },
  ]);
  expect(await server.calls[0].requestBodyJson).toEqual(expectedRequest);
});

it.each(['jev-1.13.0', 'jev-1.14.0', 'jev-latest', 'jev-preview'])(
  'sends the model ID or alias unchanged: %s',
  async modelId => {
    await provider.decisionModel(modelId).doDecide(options);
    expect(await server.calls[0].requestBodyJson).toEqual({
      ...expectedRequest,
      model: modelId,
    });
  },
);

describe('long context', () => {
  it.each([true, false, undefined])(
    'enables the header only when longContext is true: %s',
    async longContext => {
      const result = await model.doDecide({
        ...options,
        ...(longContext !== undefined && {
          providerOptions: { typesafe: { longContext } },
        }),
      });
      expect(
        server.calls[0].requestHeaders['typesafe-danger-zone-long-context'],
      ).toBe(longContext ? 'true' : undefined);
      expect(await server.calls[0].requestBodyJson).toEqual(expectedRequest);
      expect(result.warnings).toEqual([]);
    },
  );

  it('combines long context with image support and warns only for unknown options', async () => {
    const result = await model.doDecide({
      ...options,
      state: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
        },
      ],
      providerOptions: { typesafe: { longContext: true, temperature: 0 } },
      headers: { 'x-custom': 'custom' },
    });
    expect(server.calls[0].requestHeaders).toMatchObject({
      'typesafe-danger-zone-images': 'true',
      'typesafe-danger-zone-long-context': 'true',
      'x-custom': 'custom',
    });
    expect(result.warnings).toEqual([
      { type: 'unsupported', feature: 'providerOptions.typesafe.temperature' },
    ]);
  });

  it.each(['true', 1, null])(
    'rejects invalid longContext values: %j',
    async longContext => {
      await expect(
        model.doDecide({
          ...options,
          providerOptions: { typesafe: { longContext } },
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
      expect(server.calls).toHaveLength(0);
    },
  );
});

it.each([
  {
    type: 'choice',
    instructions: 'Pick',
    criteria: Object.fromEntries(
      Array.from({ length: 256 }, (_, index) => [String(index), null]),
    ),
  },
  {
    type: 'score',
    instructions: 'Rate',
    criteria: Array.from({ length: 11 }, (_, index) => `Level ${index}`),
  },
] as const)('rejects provider limits before HTTP for $type', async question => {
  await expect(
    model.doDecide({
      state: [{ type: 'text', text: 'test' }],
      questions: { question },
    }),
  ).rejects.toBeInstanceOf(InvalidArgumentError);
  expect(server.calls).toHaveLength(0);
});

describe('HTTP errors', () => {
  it.each([401, 422, 429, 529])(
    'preserves status and retryability for %s',
    async status => {
      server.urls[url].response = {
        type: 'error',
        status,
        body: JSON.stringify({ detail: 'Provider error' }),
      };
      await expect(model.doDecide(options)).rejects.toMatchObject({
        name: 'AI_APICallError',
        statusCode: status,
        message: 'Provider error',
        isRetryable: status === 429 || status === 529,
      });
      expect(server.calls).toHaveLength(1);
    },
  );

  it.each([
    { detail: [{ loc: ['body', 'questions'], msg: 'Invalid question' }] },
    { error: { message: 'Overloaded' } },
    { error: 'Overloaded' },
    { message: 'Overloaded' },
  ])('handles provider error envelopes %s', async body => {
    server.urls[url].response = {
      type: 'error',
      status: 422,
      body: JSON.stringify(body),
    };
    await expect(model.doDecide(options)).rejects.toMatchObject({
      name: 'AI_APICallError',
      statusCode: 422,
      message: 'detail' in body ? JSON.stringify(body.detail) : 'Overloaded',
    });
  });

  it('surfaces a bare error_type code, observed in production as max_tokens_exceeded', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({ error_type: 'max_tokens_exceeded' }),
    };
    await expect(model.doDecide(options)).rejects.toMatchObject({
      name: 'AI_APICallError',
      statusCode: 400,
      message: 'max_tokens_exceeded',
    });
  });

  it('prefers a prose field over the error_type code', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error_type: 'max_tokens_exceeded',
        message: 'Input exceeds the model context window',
      }),
    };
    await expect(model.doDecide(options)).rejects.toMatchObject({
      message: 'Input exceeds the model context window',
    });
  });

  it('still falls back when the body carries no recognised field', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({ unrecognised: 'shape' }),
    };
    await expect(model.doDecide(options)).rejects.toMatchObject({
      message: 'TypeSafe request failed',
    });
  });

  it('rejects malformed successful responses', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: { answers: { test: { type: 'noul' } } },
    };
    await expect(model.doDecide(options)).rejects.toBeInstanceOf(APICallError);
  });
});

it('accepts null optional metadata without inventing usage', async () => {
  server.urls[url].response = {
    type: 'json-value',
    body: {
      model: null,
      usage: null,
      answers: {
        topic: {
          type: 'choice',
          choice: 'a',
          probabilities: { a: 1 },
          confidence: null,
        },
      },
    },
  };
  const result = await model.doDecide(options);
  expect(result.usage).toEqual({
    inputTokens: undefined,
    outputTokens: undefined,
  });
  expect(result.response?.modelId).toBe('jev-latest');
  expect(result.providerMetadata).toEqual({ typesafe: { confidence: {} } });
});

it('forwards cancellation to fetch', async () => {
  const controller = new AbortController();
  const reason = new Error('cancelled');
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort(reason);
      throw reason;
    });
  await expect(
    createTypeSafeAi({ apiKey: 'test', fetch: fetchMock })
      .decisionModel('jev-latest')
      .doDecide({ ...options, abortSignal: controller.signal }),
  ).rejects.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('serializes and restores a model for workflow boundaries', async () => {
  const original = new DecisionTypeSafeAiModel('jev-latest', {
    provider: 'typesafe.decision',
    baseURL: 'https://api.typesafe.ai/v1',
    headers: () => ({ Authorization: 'Bearer restored-key' }),
    fetch: vi.fn(),
  });
  const serialized = DecisionTypeSafeAiModel[WORKFLOW_SERIALIZE](original);
  expect(serialized.config.fetch).toBeUndefined();
  const restored = DecisionTypeSafeAiModel[WORKFLOW_DESERIALIZE](
    serialized as unknown as Parameters<
      (typeof DecisionTypeSafeAiModel)[typeof WORKFLOW_DESERIALIZE]
    >[0],
  );
  await restored.doDecide(options);
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer restored-key',
  );
  expect(restored.supportedQuestionTypes).toEqual([
    'choice',
    'score',
    'boolean',
    'box',
  ]);
});

it('restores authentication from the environment when no headers are serialized', async () => {
  vi.stubEnv('TYPESAFE_AI_API_KEY', 'workflow-key');
  const restored = DecisionTypeSafeAiModel[WORKFLOW_DESERIALIZE]({
    modelId: 'jev-latest',
    config: {
      provider: 'typesafe.decision',
      baseURL: 'https://api.typesafe.ai/v1',
    },
  });
  await restored.doDecide(options);
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer workflow-key',
  );
});

it('maps text and JSON parts to native text state', async () => {
  await model.doDecide({
    ...options,
    state: [
      { type: 'text', text: 'Inspect.' },
      { type: 'json', value: [1, null] },
    ],
  });
  expect(await server.calls[0].requestBodyJson).toMatchObject({
    state: 'Inspect.\n[1,null]',
  });
});

describe('image input', () => {
  it.each(['[animal-photo]', '__proto__', 'constructor', 'request'])(
    'uses an explicit reference in assets, state, instructions, and criteria: %s',
    async reference => {
      const imageQuestions = {
        cat: {
          type: 'boolean' as const,
          instructions: `Does ${reference} show a cat?`,
          criteria: { true: { image: reference } },
        },
      };
      const result = await model.doDecide({
        state: [
          {
            type: 'file',
            filename: 'unrelated-name.png',
            mediaType: 'image/png',
            data: { type: 'data', data: 'iVBORw==' },
            providerOptions: { typesafe: { reference } },
          },
          {
            type: 'file',
            mediaType: 'image/jpeg',
            data: { type: 'data', data: '/9j/4A==' },
          },
        ],
        questions: imageQuestions,
      });
      const multipart = await server.calls[0].requestBodyMultipart;
      const body = JSON.parse(await multipart!.request.text());
      const references = Object.keys(body.assets);
      expect(references).toHaveLength(2);
      expect(references).toContain(reference);
      const generatedReference = references.find(key => key !== reference);
      expect(body.state).toBe(`${reference}\n${generatedReference}`);
      expect(body.assets[reference]).toEqual({
        type: 'image',
        part: 'image-0',
      });
      expect(multipart!['image-0'].name).toBe('unrelated-name.png');
      expect(body.questions.cat).toEqual({
        ...imageQuestions.cat,
        type: 'noul',
      });
      expect(result.warnings).toEqual([]);
    },
  );

  it.each(['', ' \t\n', 123, true, null])(
    'rejects invalid references before HTTP: %j',
    async reference => {
      await expect(
        model.doDecide({
          ...options,
          state: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: 'iVBORw==' },
              providerOptions: { typesafe: { reference } },
            },
          ],
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
      expect(server.calls).toHaveLength(0);
    },
  );

  it('keeps JSON state as an object when it already contains the reference', async () => {
    await model.doDecide({
      ...options,
      state: [
        { type: 'json', value: { photo: '[photo]', note: 'Box arrived wet.' } },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
          providerOptions: { typesafe: { reference: '[photo]' } },
        },
      ],
    });
    const multipart = await server.calls[0].requestBodyMultipart;
    const body = JSON.parse(await multipart!.request.text());
    expect(body.state).toEqual({ photo: '[photo]', note: 'Box arrived wet.' });
    expect(body.assets).toEqual({
      '[photo]': { type: 'image', part: 'image-1' },
    });
    expect(Object.keys(multipart!)).toEqual(['request', 'image-1']);
    expect(server.calls[0].requestHeaders['typesafe-danger-zone-images']).toBe(
      'true',
    );
  });

  it('leaves text state unchanged when it already contains the reference', async () => {
    await model.doDecide({
      ...options,
      state: [
        { type: 'text', text: 'Is [photo] damaged?' },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: { type: 'data', data: '/9j/4A==' },
          providerOptions: { typesafe: { reference: '[photo]' } },
        },
      ],
    });
    const multipart = await server.calls[0].requestBodyMultipart;
    const body = JSON.parse(await multipart!.request.text());
    expect(body.state).toBe('Is [photo] damaged?');
    expect(Object.keys(body.assets)).toEqual(['[photo]']);
  });

  it('finds references in nested JSON string values but not in object keys', async () => {
    await model.doDecide({
      ...options,
      state: [
        {
          type: 'json',
          value: {
            frames: [{ seconds_ago: 0, frame: 'Latest frame: [frame]' }],
            '[label]': 'A key is not a reference.',
          },
        },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
          providerOptions: { typesafe: { reference: '[frame]' } },
        },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
          providerOptions: { typesafe: { reference: '[label]' } },
        },
      ],
    });
    const multipart = await server.calls[0].requestBodyMultipart;
    const body = JSON.parse(await multipart!.request.text());
    expect(body.state).toBe(
      `${JSON.stringify({
        frames: [{ seconds_ago: 0, frame: 'Latest frame: [frame]' }],
        '[label]': 'A key is not a reference.',
      })}\n[label]`,
    );
  });

  it('sends a question-only image without touching state when insertReference is false', async () => {
    await model.doDecide({
      state: [
        { type: 'json', value: { photo: '[found]' } },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: { type: 'data', data: '/9j/4A==' },
          providerOptions: { typesafe: { reference: '[found]' } },
        },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: { type: 'data', data: '/9j/4A==' },
          providerOptions: {
            typesafe: { reference: '[poster]', insertReference: false },
          },
        },
      ],
      questions: {
        same: {
          type: 'boolean',
          instructions: 'Is the dog in `photo` the dog in [poster]?',
        },
      },
    });
    const multipart = await server.calls[0].requestBodyMultipart;
    const body = JSON.parse(await multipart!.request.text());
    expect(body.state).toEqual({ photo: '[found]' });
    expect(Object.keys(body.assets)).toEqual(['[found]', '[poster]']);
  });

  it('inserts a reference already in state when insertReference is true', async () => {
    await model.doDecide({
      ...options,
      state: [
        { type: 'text', text: 'Before: [photo]' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
          providerOptions: {
            typesafe: { reference: '[photo]', insertReference: true },
          },
        },
      ],
    });
    const multipart = await server.calls[0].requestBodyMultipart;
    const body = JSON.parse(await multipart!.request.text());
    expect(body.state).toBe('Before: [photo]\n[photo]');
  });

  it('inserts only the references that are not already placed', async () => {
    await model.doDecide({
      ...options,
      state: [
        { type: 'text', text: 'Compare [before] with the new photo.' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
          providerOptions: {
            typesafe: { reference: '[before]', insertReference: false },
          },
        },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
          providerOptions: { typesafe: { reference: '[after]' } },
        },
      ],
    });
    const multipart = await server.calls[0].requestBodyMultipart;
    const body = JSON.parse(await multipart!.request.text());
    expect(body.state).toBe('Compare [before] with the new photo.\n[after]');
    expect(body.assets).toEqual({
      '[before]': { type: 'image', part: 'image-1' },
      '[after]': { type: 'image', part: 'image-2' },
    });
  });

  it('rejects insertReference: false without an explicit reference before HTTP', async () => {
    await expect(
      model.doDecide({
        ...options,
        state: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: 'iVBORw==' },
            providerOptions: { typesafe: { insertReference: false } },
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'providerOptions.typesafe.reference',
    });
    expect(server.calls).toHaveLength(0);
  });

  it('rejects duplicate image references before HTTP', async () => {
    await expect(
      model.doDecide({
        ...options,
        state: ['iVBORw==', '/9j/4A=='].map(data => ({
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data },
          providerOptions: { typesafe: { reference: '[photo]' } },
        })),
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'providerOptions.typesafe.reference',
      message: 'Duplicate TypeSafe image reference: [photo]',
    });
    expect(server.calls).toHaveLength(0);
  });

  it('maps mixed text, JSON, and multiple images to referenced assets', async () => {
    await model.doDecide({
      ...options,
      state: [
        { type: 'text', text: 'Compare these images.' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: new Uint8Array([137, 80, 78, 71]) },
        },
        { type: 'json', value: { label: 'second' } },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: { type: 'data', data: '/9j/4A==' },
        },
      ],
    });
    const multipart = await server.calls[0].requestBodyMultipart;
    const body = JSON.parse(await multipart!.request.text());
    const references = Object.keys(body.assets);
    expect(references).toHaveLength(2);
    expect(references[0]).not.toBe(references[1]);
    expect(body.state).toBe(
      `Compare these images.\n${references[0]}\n{"label":"second"}\n${references[1]}`,
    );
    expect(Object.values(body.assets)).toEqual([
      { type: 'image', part: 'image-1' },
      { type: 'image', part: 'image-3' },
    ]);
    expect(Object.keys(multipart!)).toEqual(['request', 'image-1', 'image-3']);
    expect(multipart!.request.type).toBe('application/json');
    expect(multipart!['image-1'].type).toBe('image/png');
    expect(multipart!['image-1'].name).toBe('image-1.png');
    expect(new Uint8Array(await multipart!['image-1'].arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    expect(multipart!['image-3'].type).toBe('image/jpeg');
    expect(new Uint8Array(await multipart!['image-3'].arrayBuffer())).toEqual(
      new Uint8Array([255, 216, 255, 224]),
    );
    expect(server.calls[0].requestHeaders['content-type']).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(server.calls[0].requestHeaders['typesafe-danger-zone-images']).toBe(
      'true',
    );
  });

  it('omits assets and the image header for text-only input', async () => {
    await model.doDecide(options);
    expect(await server.calls[0].requestBodyJson).not.toHaveProperty('assets');
    expect(server.calls[0].requestHeaders).not.toHaveProperty(
      'typesafe-danger-zone-images',
    );
  });

  it('uses fresh references for each request', async () => {
    const imageOptions = {
      ...options,
      state: [
        {
          type: 'file' as const,
          mediaType: 'image/png',
          data: { type: 'data' as const, data: 'iVBORw0KGgo=' },
        },
      ],
    };
    await model.doDecide(imageOptions);
    await model.doDecide(imageOptions);
    const first = await server.calls[0].requestBodyMultipart;
    const second = await server.calls[1].requestBodyMultipart;
    expect(JSON.parse(await first!.request.text()).state).not.toBe(
      JSON.parse(await second!.request.text()).state,
    );
  });

  it.each(['application/pdf', 'image/webp', 'image/gif', 'image'])(
    'rejects unsupported or unrecognized media before HTTP: %s',
    async mediaType => {
      await expect(
        model.doDecide({
          ...options,
          state: [
            { type: 'file', mediaType, data: { type: 'data', data: 'AAAA' } },
          ],
        }),
      ).rejects.toMatchObject({ name: 'AI_UnsupportedFunctionalityError' });
      expect(server.calls).toHaveLength(0);
    },
  );

  it.each([
    { type: 'url' as const, url: new URL('https://example.com/image.png') },
    { type: 'reference' as const, reference: { typesafe: 'file-id' } },
    { type: 'text' as const, text: 'not an image' },
  ])('rejects unsupported file data before HTTP: $type', async data => {
    await expect(
      model.doDecide({
        ...options,
        state: [{ type: 'file', mediaType: 'image/png', data }],
      }),
    ).rejects.toMatchObject({ name: 'AI_UnsupportedFunctionalityError' });
    expect(server.calls).toHaveLength(0);
  });
});

it.each([{ nested: { amount: 49 }, history: ['refund'] }, [1, null]])(
  'preserves a single JSON state part as native JSON: %j',
  async value => {
    await model.doDecide({ ...options, state: [{ type: 'json', value }] });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      state: value,
    });
  },
);

it.each([true, false])(
  'sends box questions and enables the images header (image: %s)',
  async withImage => {
    const box = { top: 0.25, bottom: 0.82, left: 0.44, right: 0.84 };
    server.urls[url].response = {
      type: 'json-value',
      body: {
        ...nativeResponse,
        answers: {
          ...nativeResponse.answers,
          target: { type: 'box', box, confidence: 0.92 },
        },
      },
    };
    const result = await model.doDecide({
      ...options,
      ...(withImage && {
        state: [
          {
            type: 'file' as const,
            mediaType: 'image/png',
            data: { type: 'data' as const, data: new Uint8Array([1, 2, 3]) },
          },
        ],
      }),
      questions: {
        ...questions,
        target: { type: 'box', instructions: 'The mug' },
      },
    });
    expect(model.supportedQuestionTypes).toContain('box');
    expect(result.answers.target).toEqual({ type: 'box', box });
    expect(result.providerMetadata?.typesafe?.confidence).toMatchObject({
      target: 0.92,
    });
    expect(server.calls[0].requestHeaders['typesafe-danger-zone-images']).toBe(
      'true',
    );
    const body = withImage
      ? JSON.parse(
          await (await server.calls[0].requestBodyMultipart)!.request.text(),
        )
      : await server.calls[0].requestBodyJson;
    expect(body.questions.target).toEqual({
      type: 'box',
      instructions: 'The mug',
    });
  },
);
