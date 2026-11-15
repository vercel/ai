import {
  Experimental_ExtractionUnsupportedFieldTypeError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScaleDownExtractionModel } from './scaledown-extraction-model';
import { createScaleDown } from './scaledown-provider';

const url = 'https://api.scaledown.xyz/v1/chat/completions';
const server = createTestServer({ [url]: {} });
const model = createScaleDown({ apiKey: 'test-key' }).extractionModel(
  'extract-1',
);
const options = {
  state: [{ type: 'text' as const, text: 'Acme Corp. Contacts: Ana, Bo.' }],
  fields: {
    vendor: { type: 'text' as const, instructions: 'Company name' },
    contacts: {
      type: 'list' as const,
      items: 'text' as const,
      instructions: { find: 'Contact names' },
    },
    missing: { type: 'text' as const },
    empty: { type: 'list' as const, items: 'text' as const },
  },
};
// Entity shape from https://docs.scaledown.ai/api-reference/extract.
const content = {
  entities: [
    ...['vendor', 'contacts', 'missing', 'empty'].map(type => ({
      text: '',
      type,
      confidence: 1,
    })),
    { text: 'Acme Corp', type: 'vendor', confidence: 0.97, start: 0, end: 9 },
    { text: 'Ana', type: 'contacts', confidence: 0.9, start: 21, end: 24 },
    { text: 'Bo', type: 'contacts', confidence: 0.85, start: 26, end: 28 },
  ],
  structured_result: null,
  input_tokens: 42,
  ocr_text: null,
};
const response = {
  id: 'extract-123',
  created: 1700000000,
  model: 'extract-1',
  choices: [{ message: { content: JSON.stringify(content) } }],
  usage: { prompt_tokens: 42, completion_tokens: 12, total_tokens: 54 },
};

beforeEach(() => {
  server.urls[url].response = { type: 'json-value', body: response };
});
afterEach(() => vi.unstubAllEnvs());

it('maps text and lists, missing values, confidence, sources, and usage', async () => {
  const result = await model.doExtract({
    ...options,
    providerOptions: { scaledown: { threshold: 0.5 } },
  });
  expect(await server.calls[0].requestBodyJson).toEqual({
    model: 'extract-1',
    messages: [{ role: 'user', content: options.state[0].text }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'extraction',
        schema: {
          type: 'object',
          properties: {
            vendor: { type: 'string', description: 'Company name', top_n: 1 },
            contacts: {
              type: 'string',
              description: '{"find":"Contact names"}',
              top_n: 0,
            },
            missing: { type: 'string', top_n: 1 },
            empty: { type: 'string', top_n: 0 },
          },
        },
      },
    },
    threshold: 0.5,
    context_chars: 0,
  });
  expect(result.answers).toEqual({
    vendor: {
      type: 'text',
      value: 'Acme Corp',
      confidence: 0.97,
      source: { type: 'text', part: 0, start: 0, end: 9 },
    },
    contacts: {
      type: 'list',
      value: ['Ana', 'Bo'],
      items: [
        {
          confidence: 0.9,
          source: { type: 'text', part: 0, start: 21, end: 24 },
        },
        {
          confidence: 0.85,
          source: { type: 'text', part: 0, start: 26, end: 28 },
        },
      ],
    },
    missing: { type: 'text', value: null },
    empty: { type: 'list', value: null },
  });
  expect(result.answers.empty).not.toHaveProperty('items');
  expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 12 });
  expect(result.response).toMatchObject({
    id: 'extract-123',
    timestamp: new Date(1700000000000),
    modelId: 'extract-1',
    body: response,
  });
  expect(result.warnings).toEqual([]);
});

it('preserves field IDs with spaces, camelCase, Unicode, and distinct casing', async () => {
  // Field IDs and entity text verified against the live ScaleDown API.
  const entities = [
    { type: 'invoice number', text: 'INV-2041', confidence: 0.9 },
    { type: 'dueDate', text: '2026-12-01', confidence: 0.9 },
    { type: '客户名称', text: 'Zoë Martin', confidence: 0.9 },
    { type: 'Vendor', text: 'Acme Corp', confidence: 0.9 },
  ];
  server.urls[url].response = {
    type: 'json-value',
    body: {
      ...response,
      choices: [{ message: { content: JSON.stringify({ entities }) } }],
    },
  };

  const result = await model.doExtract({
    state: [
      {
        type: 'text',
        text: 'Invoice INV-2041 issued by Acme Corp to Zoë Martin. Payment is due on 2026-12-01.',
      },
    ],
    fields: {
      'invoice number': { type: 'text', instructions: 'Invoice identifier' },
      dueDate: { type: 'text', instructions: 'Exact payment due date' },
      客户名称: {
        type: 'text',
        instructions: 'Name of the person receiving the invoice',
      },
      Vendor: {
        type: 'text',
        instructions: 'Name of the company issuing the invoice',
      },
      vendor: {
        type: 'text',
        instructions: 'Name of the company receiving the invoice',
      },
    },
  });
  const body = await server.calls[0].requestBodyJson;
  expect(
    Object.keys(body.response_format.json_schema.schema.properties),
  ).toEqual(['invoice number', 'dueDate', '客户名称', 'Vendor', 'vendor']);
  expect(result.answers).toEqual({
    'invoice number': { type: 'text', value: 'INV-2041', confidence: 0.9 },
    dueDate: { type: 'text', value: '2026-12-01', confidence: 0.9 },
    客户名称: { type: 'text', value: 'Zoë Martin', confidence: 0.9 },
    Vendor: { type: 'text', value: 'Acme Corp', confidence: 0.9 },
    vendor: { type: 'text', value: null },
  });
});

it('converts UTF-8 offsets across JSON and Unicode text parts without inventing sources', async () => {
  server.urls[url].response = {
    type: 'json-value',
    body: {
      ...response,
      choices: [
        {
          message: {
            content: JSON.stringify({
              entities: [
                {
                  type: 'names',
                  text: 'Acmé',
                  confidence: 0.9,
                  start: 19,
                  end: 24,
                },
                {
                  type: 'names',
                  text: 'Zoë',
                  confidence: 0.8,
                  start: 29,
                  end: 33,
                },
                { type: 'note', text: 'é', confidence: 0.9, start: 9, end: 11 },
                {
                  type: 'invalid',
                  text: 'Acmé',
                  confidence: 0.9,
                  start: 20,
                  end: 25,
                },
              ],
            }),
          },
        },
      ],
    },
  };
  const result = await model.doExtract({
    state: [
      { type: 'json', value: { note: 'é' } },
      { type: 'text', text: '🙂 Acmé and Zoë.' },
    ],
    fields: {
      names: { type: 'list', items: 'text' },
      note: { type: 'text' },
      invalid: { type: 'text' },
    },
  });
  expect(await server.calls[0].requestBodyJson).toMatchObject({
    messages: [{ role: 'user', content: '{"note":"é"}\n🙂 Acmé and Zoë.' }],
  });
  expect(result.answers.names).toMatchObject({
    items: [
      { source: { type: 'text', part: 1, start: 3, end: 7 } },
      { source: { type: 'text', part: 1, start: 12, end: 15 } },
    ],
  });
  expect(result.answers.note).toEqual({
    type: 'text',
    value: 'é',
    confidence: 0.9,
  });
  expect(result.answers.invalid).toEqual({
    type: 'text',
    value: 'Acmé',
    confidence: 0.9,
  });
});

it('sends a base64 document and returns file sources and OCR text', async () => {
  server.urls[url].response = {
    type: 'json-value',
    body: {
      ...response,
      usage: null,
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...content,
              ocr_text: options.state[0].text,
            }),
          },
        },
      ],
    },
  };
  const result = await model.doExtract({
    ...options,
    state: [
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      },
    ],
  });
  expect(await server.calls[0].requestBodyJson).toMatchObject({
    messages: [
      {
        role: 'user',
        content: 'Extract the requested fields from the document.',
      },
    ],
    document: 'AQID',
    document_mime_type: 'application/pdf',
  });
  expect(result.answers.vendor).toMatchObject({
    source: { type: 'file', part: 0 },
  });
  expect(result.providerMetadata).toEqual({
    scaledown: { ocrText: options.state[0].text },
  });
  expect(result.usage).toEqual({ inputTokens: 42, outputTokens: undefined });
});

it('rejects unsupported fields and files before sending a request', async () => {
  for (const field of [
    { type: 'number' },
    { type: 'date' },
    { type: 'list', items: 'number' },
    { type: 'list', items: 'date' },
  ] as const) {
    await expect(
      model.doExtract({ ...options, fields: { value: field } }),
    ).rejects.toBeInstanceOf(Experimental_ExtractionUnsupportedFieldTypeError);
  }
  await expect(
    model.doExtract({
      ...options,
      state: [
        {
          type: 'file',
          mediaType: 'audio/wav',
          data: { type: 'data', data: 'AQID' },
        },
      ],
    }),
  ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  expect(server.calls).toHaveLength(0);
});

it('passes custom configuration and warns about unsupported settings', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(JSON.stringify(response)));
  const abortSignal = new AbortController().signal;
  const result = await createScaleDown({
    apiKey: async () => 'custom-key',
    baseURL: 'https://custom.example/',
    headers: { shared: 'provider' },
    fetch,
  })
    .extractionModel('extract')
    .doExtract({
      ...options,
      headers: { shared: 'call' },
      abortSignal,
      referenceDate: '2026-11-12',
      reasoning: 'high',
      maxOutputTokens: 10,
    });
  const [requestUrl, init] = fetch.mock.calls[0];
  expect(requestUrl).toBe('https://custom.example/v1/chat/completions');
  expect(new Headers(init?.headers).get('x-api-key')).toBe('custom-key');
  expect(new Headers(init?.headers).get('shared')).toBe('call');
  expect(init?.signal).toBe(abortSignal);
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'referenceDate' },
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
  ]);
});

it('restores workflow configuration and environment authentication', async () => {
  vi.stubEnv('SCALEDOWN_API_KEY', 'env-key');
  const serialized = ScaleDownExtractionModel[WORKFLOW_SERIALIZE](
    model as ScaleDownExtractionModel,
  );
  expect(serialized).toMatchObject({
    modelId: 'extract-1',
    config: { headers: { 'x-api-key': 'test-key' } },
  });
  const restored = ScaleDownExtractionModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: {
      provider: 'scaledown.extraction',
      baseURL: 'https://api.scaledown.xyz',
    },
  });
  await restored.doExtract(options);
  expect(server.calls[0].requestHeaders['x-api-key']).toBe('env-key');
  expect(restored.supportedFieldTypes).toEqual(['text', 'list']);
});

it('rejects malformed inner JSON and surfaces API errors', async () => {
  for (const content of ['not JSON', '{"entities":"invalid"}']) {
    server.urls[url].response = {
      type: 'json-value',
      body: {
        ...response,
        choices: [{ message: { content } }],
      },
    };
    const extraction = model.doExtract(options);
    await expect(extraction).rejects.toBeInstanceOf(InvalidResponseDataError);
    await expect(extraction).rejects.toMatchObject({ data: content });
  }
  server.urls[url].response = {
    type: 'error',
    status: 402,
    body: JSON.stringify({ detail: 'Insufficient credits' }),
    headers: { 'content-type': 'application/json' },
  };
  await expect(model.doExtract(options)).rejects.toMatchObject({
    statusCode: 402,
    message: 'Insufficient credits',
  });
});
