import {
  APICallError,
  InvalidResponseDataError,
  Experimental_ExtractionRefusalError as ExtractionRefusalError,
  Experimental_ExtractionUnsupportedFieldTypeError as ExtractionUnsupportedFieldTypeError,
  type Experimental_ExtractionModelV4Answer as ExtractionAnswer,
  type Experimental_ExtractionModelV4Field as ExtractionField,
  type Experimental_ExtractionModelV4Result as ExtractionModelV4Result,
} from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { UnsupportedModelVersionError } from '../error/unsupported-model-version-error';
import { createDownload, experimental_extract as extract } from '../index';
import { ExtractionMockModelV4 } from '../test/extraction-mock-model-v4';

const state =
  'Invoice INV-2041, total due $1,250.00 by March 3, 2027 at 17:30. Call Ana or Bo within 2 hours.';

const fields = {
  invoiceNumber: { type: 'text', instructions: 'The invoice number' },
  total: {
    type: 'number',
    instructions: 'Total due',
    unit: 'USD',
    decimals: 2,
  },
  dueDate: { type: 'date', instructions: 'Due date' },
  dueTime: { type: 'time', instructions: 'Due time' },
  dueAt: { type: 'datetime', instructions: 'Due date and time' },
  callWithin: { type: 'duration', instructions: 'Call window', unit: 'hours' },
  contacts: { type: 'list', items: 'text', instructions: 'Contact names' },
} as const;

const answers: ExtractionModelV4Result['answers'] = {
  invoiceNumber: {
    type: 'text',
    value: 'INV-2041',
    confidence: 0.98,
    source: { type: 'text', part: 0, start: 8, end: 16 },
  },
  total: { type: 'number', value: 1250, pNull: 0.01 },
  dueDate: { type: 'date', value: '2027-03-03' },
  dueTime: { type: 'time', value: '17:30' },
  dueAt: { type: 'datetime', value: '2027-03-03T17:30' },
  callWithin: { type: 'duration', value: 2 },
  contacts: {
    type: 'list',
    value: ['Ana', 'Bo'],
    items: [
      {
        confidence: 0.9,
        source: { type: 'text', part: 0, start: 70, end: 73 },
      },
      { confidence: 0.8 },
    ],
  },
};

function setup(result: ExtractionModelV4Result = { answers, warnings: [] }) {
  const doExtract = vi
    .fn<ExtractionMockModelV4['doExtract']>()
    .mockResolvedValue(result);
  return { doExtract, model: new ExtractionMockModelV4({ doExtract }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('extracts every field in one call and preserves metadata', async () => {
  const warning = { type: 'other', message: 'Provider note' } as const;
  const timestamp = new Date('2026-11-11T12:00:00Z');
  const logger = vi.fn();
  vi.stubGlobal('AI_SDK_LOG_WARNINGS', logger);
  const { model, doExtract } = setup({
    answers,
    warnings: [warning],
    usage: { inputTokens: 40, outputTokens: 12 },
    providerMetadata: { test: { passes: 1 } },
    response: {
      id: 'response',
      timestamp,
      modelId: 'actual-model',
      headers: { 'x-request-id': 'request' },
      body: { raw: true },
    },
  });
  const abortSignal = new AbortController().signal;

  const result = await extract({
    model,
    state,
    fields,
    referenceDate: '2026-11-11',
    maxOutputTokens: 200,
    reasoning: 'low',
    abortSignal,
    headers: { custom: 'value' },
    providerOptions: { test: { option: true } },
  });

  expect(doExtract).toHaveBeenCalledTimes(1);
  expect(doExtract).toHaveBeenCalledWith({
    state: [{ type: 'text', text: state }],
    fields,
    referenceDate: '2026-11-11',
    maxOutputTokens: 200,
    reasoning: 'low',
    abortSignal,
    headers: { custom: 'value', 'user-agent': expect.stringContaining('ai/') },
    providerOptions: { test: { option: true } },
  });
  expect(state.slice(8, 16)).toBe('INV-2041');
  expect(state.slice(70, 73)).toBe('Ana');
  expect(result).toMatchInlineSnapshot(`
    {
      "answers": {
        "callWithin": {
          "type": "duration",
          "value": 2,
        },
        "contacts": {
          "items": [
            {
              "confidence": 0.9,
              "source": {
                "end": 73,
                "part": 0,
                "start": 70,
                "type": "text",
              },
            },
            {
              "confidence": 0.8,
            },
          ],
          "type": "list",
          "value": [
            "Ana",
            "Bo",
          ],
        },
        "dueAt": {
          "type": "datetime",
          "value": "2027-03-03T17:30",
        },
        "dueDate": {
          "type": "date",
          "value": "2027-03-03",
        },
        "dueTime": {
          "type": "time",
          "value": "17:30",
        },
        "invoiceNumber": {
          "confidence": 0.98,
          "source": {
            "end": 16,
            "part": 0,
            "start": 8,
            "type": "text",
          },
          "type": "text",
          "value": "INV-2041",
        },
        "total": {
          "pNull": 0.01,
          "type": "number",
          "value": 1250,
        },
      },
      "providerMetadata": {
        "test": {
          "passes": 1,
        },
      },
      "response": {
        "body": {
          "raw": true,
        },
        "headers": {
          "x-request-id": "request",
        },
        "id": "response",
        "modelId": "actual-model",
        "timestamp": 2026-11-11T12:00:00.000Z,
      },
      "usage": {
        "inputTokens": 40,
        "outputTokens": 12,
        "totalTokens": 52,
      },
      "warnings": [
        {
          "message": "Provider note",
          "type": "other",
        },
      ],
    }
  `);
  expect(logger).toHaveBeenCalledWith({
    warnings: [warning],
    provider: model.provider,
    model: model.modelId,
  });
});

it.each(['', ' INV-2041 ', '   '])(
  'normalizes empty answers and preserves text %j and metadata',
  async value => {
    const providerAnswers: ExtractionModelV4Result['answers'] = {
      ...answers,
      invoiceNumber: {
        type: 'text',
        value,
        confidence: 0.98,
        source: { type: 'text', part: 0, start: 8, end: 16 },
      },
      dueDate: { type: 'date', value: '' },
      contacts: {
        type: 'list',
        value: [],
        items: [],
        confidence: 0.8,
        pNull: 0.9,
      },
    };
    const result = await extract({
      ...setup({ answers: providerAnswers, warnings: [] }),
      state,
      fields,
    });
    expect(result.answers).toEqual({
      ...providerAnswers,
      invoiceNumber: {
        ...providerAnswers.invoiceNumber,
        value: value === '' ? null : value,
      },
      dueDate: { type: 'date', value: null },
      contacts: { type: 'list', value: null, confidence: 0.8, pNull: 0.9 },
    });
    expect(result.answers.contacts).not.toHaveProperty('items');
    expect(providerAnswers.contacts).toEqual({
      type: 'list',
      value: [],
      items: [],
      confidence: 0.8,
      pNull: 0.9,
    });
  },
);

it('accepts null values for fields the state does not contain', async () => {
  const empty = Object.fromEntries(
    Object.entries(fields).map(([id, field]) => [
      id,
      { type: field.type, value: null } as ExtractionAnswer,
    ]),
  );
  const result = await extract({
    ...setup({ answers: empty, warnings: [] }),
    state: '',
    fields,
  });
  expect(result.answers).toEqual(empty);
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

it('rejects unsupported types before any provider I/O', async () => {
  const doExtract = vi.fn<ExtractionMockModelV4['doExtract']>();
  const model = new ExtractionMockModelV4({
    supportedFieldTypes: ['text'],
    doExtract,
  });
  const error = await extract({ model, state, fields }).catch(
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ExtractionUnsupportedFieldTypeError);
  expect(error).toMatchObject({
    fieldId: 'total',
    fieldType: 'number',
    provider: model.provider,
    modelId: model.modelId,
  });
  expect(doExtract).not.toHaveBeenCalled();
});

it.each([['total'], ['total', 'contacts']])(
  'rejects refused fields with a refusal error without retrying (%s)',
  async (...refused) => {
    const { model, doExtract } = setup({
      answers: {
        ...answers,
        ...Object.fromEntries(refused.map(id => [id, { type: 'refusal' }])),
      },
      warnings: [],
    });
    const error = await extract({ model, state, fields }).catch(
      (caught: unknown) => caught,
    );
    expect(ExtractionRefusalError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      fieldIds: refused,
      provider: model.provider,
      modelId: model.modelId,
    });
    expect(doExtract).toHaveBeenCalledTimes(1);
  },
);

it('rejects an unsupported model version', async () => {
  const { model, doExtract } = setup();
  Object.assign(model, { specificationVersion: 'v99' });
  await expect(extract({ model, state, fields })).rejects.toBeInstanceOf(
    UnsupportedModelVersionError,
  );
  expect(doExtract).not.toHaveBeenCalled();
});

describe('input validation', () => {
  it.each<[string, Record<string, ExtractionField>, string | undefined]>([
    ['an empty field map', {}, undefined],
    ['decimals above 6', { total: { type: 'number', decimals: 7 } }, undefined],
    [
      'fractional decimals',
      { total: { type: 'duration', decimals: 1.5 } },
      undefined,
    ],
    [
      'an unknown duration unit',
      { wait: { type: 'duration', unit: 'fortnights' as 'days' } },
      undefined,
    ],
    [
      'an unknown list item type',
      { names: { type: 'list', items: 'time' as 'text' } },
      undefined,
    ],
    [
      'non-finite instructions',
      { total: { type: 'number', instructions: { max: Infinity } } },
      undefined,
    ],
    ['a malformed reference date', { name: { type: 'text' } }, '11/11/2026'],
    ['an impossible reference date', { name: { type: 'text' } }, '2026-02-30'],
  ])('rejects %s before any provider I/O', async (_, input, referenceDate) => {
    const { model, doExtract } = setup();
    await expect(
      extract({ model, state, fields: input, referenceDate }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(doExtract).not.toHaveBeenCalled();
  });

  it('rejects state with array holes', async () => {
    const { model, doExtract } = setup();
    const holes = new Array(2);
    holes[1] = { type: 'text', text: 'b' };
    await expect(
      extract({
        model,
        state: holes,
        fields,
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(doExtract).not.toHaveBeenCalled();
  });
});

describe('response validation', () => {
  it.each<[string, Record<string, unknown>]>([
    ['a missing answer', { total: undefined }],
    ['an extra answer', { extra: { type: 'text', value: 'x' } }],
    ['a wrong answer type', { total: { type: 'text', value: '1250' } }],
    ['a string number', { total: { type: 'number', value: '1250' } }],
    ['a non-finite number', { total: { type: 'number', value: Infinity } }],
    ['too many decimals', { total: { type: 'number', value: 1250.005 } }],
    ['an undefined value', { invoiceNumber: { type: 'text' } }],
    ['a malformed date', { dueDate: { type: 'date', value: '03/03/2027' } }],
    ['an impossible date', { dueDate: { type: 'date', value: '2027-02-29' } }],
    ['an impossible time', { dueTime: { type: 'time', value: '24:00' } }],
    [
      'a datetime without a time',
      { dueAt: { type: 'datetime', value: '2027-03-03' } },
    ],
    [
      'a datetime with an impossible date',
      { dueAt: { type: 'datetime', value: '2027-13-03T17:30Z' } },
    ],
    ['a negative duration', { callWithin: { type: 'duration', value: -2 } }],
    [
      'a list with a wrong item type',
      { contacts: { type: 'list', value: ['Ana', 2] } },
    ],
    [
      'a list that is not an array',
      { contacts: { type: 'list', value: 'Ana, Bo' } },
    ],
    [
      'list item entries that do not match the values',
      { contacts: { type: 'list', value: ['Ana'], items: [{}, {}] } },
    ],
    [
      'a sparse list with a huge length',
      {
        contacts: {
          type: 'list',
          value: Object.assign([], { length: 2 ** 32 - 1 }),
        },
      },
    ],
    [
      'a list with holes',
      {
        contacts: {
          type: 'list',
          value: Object.assign(new Array(2), { 0: 'Ana' }),
        },
      },
    ],
    [
      'a list with a hole masked by an enumerable property',
      {
        contacts: {
          type: 'list',
          value: Object.assign(new Array(1), { metadata: 'provider data' }),
        },
      },
    ],
    [
      'list item entries with a hole masked by an enumerable property',
      {
        contacts: {
          type: 'list',
          value: ['Ana'],
          items: Object.assign(new Array(1), { metadata: 'provider data' }),
        },
      },
    ],
    [
      'sparse list item entries with a huge length',
      {
        contacts: {
          type: 'list',
          value: ['Ana'],
          items: Object.assign([], { length: 2 ** 32 - 1 }),
        },
      },
    ],
    [
      'list item entries without values',
      { contacts: { type: 'list', value: null, items: [] } },
    ],
    ['a pNull above 1', { total: { type: 'number', value: 1250, pNull: 1.5 } }],
    [
      'a negative confidence',
      { total: { type: 'number', value: 1250, confidence: -0.1 } },
    ],
    [
      'an invalid guess',
      { total: { type: 'number', value: null, guess: 'x' } },
    ],
    [
      'a source past the end of the text',
      {
        invoiceNumber: {
          type: 'text',
          value: 'INV-2041',
          source: { type: 'text', part: 0, start: 8, end: state.length + 1 },
        },
      },
    ],
    [
      'an empty source span',
      {
        invoiceNumber: {
          type: 'text',
          value: 'INV-2041',
          source: { type: 'text', part: 0, start: 8, end: 8 },
        },
      },
    ],
    [
      'a source part outside the state',
      {
        invoiceNumber: {
          type: 'text',
          value: 'INV-2041',
          source: { type: 'text', part: 1, start: 0, end: 1 },
        },
      },
    ],
    [
      'a file source on a text part',
      {
        invoiceNumber: {
          type: 'text',
          value: 'INV-2041',
          source: { type: 'file', part: 0 },
        },
      },
    ],
  ])('rejects %s', async (_, override) => {
    const merged: Record<string, unknown> = { ...answers, ...override };
    for (const [id, answer] of Object.entries(merged)) {
      if (answer === undefined) delete merged[id];
    }
    const { model } = setup({
      answers: merged as ExtractionModelV4Result['answers'],
      warnings: [],
    });
    await expect(extract({ model, state, fields })).rejects.toBeInstanceOf(
      InvalidResponseDataError,
    );
  });

  it('enforces integer fields and list item number rules', async () => {
    const integerFields = {
      count: { type: 'number', integer: true },
      scores: { type: 'list', items: 'number', decimals: 1 },
    } as const;
    await expect(
      extract({
        ...setup({
          answers: {
            count: { type: 'number', value: 3 },
            scores: { type: 'list', value: [1.5, 2] },
          },
          warnings: [],
        }),
        state,
        fields: integerFields,
      }),
    ).resolves.toBeDefined();
    await expect(
      extract({
        ...setup({
          answers: {
            count: { type: 'number', value: 3.5 },
            scores: { type: 'list', value: [1.5] },
          },
          warnings: [],
        }),
        state,
        fields: integerFields,
      }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
    await expect(
      extract({
        ...setup({
          answers: {
            count: { type: 'number', value: 3 },
            scores: { type: 'list', value: [1.55] },
          },
          warnings: [],
        }),
        state,
        fields: integerFields,
      }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  });

  it('accepts datetimes with seconds, fractions, and offsets', async () => {
    for (const value of [
      '2027-03-03T17:30:00Z',
      '2027-03-03T17:30:00.123+01:00',
      '2027-03-03T17:30-08:00',
    ]) {
      await expect(
        extract({
          ...setup({
            answers: { dueAt: { type: 'datetime', value } },
            warnings: [],
          }),
          state,
          fields: { dueAt: fields.dueAt },
        }),
      ).resolves.toBeDefined();
    }
  });

  it('accepts sources that point into later text parts and file parts', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const { model } = setup({
      answers: {
        invoiceNumber: {
          type: 'text',
          value: 'INV-2041',
          source: { type: 'text', part: 2, start: 0, end: 8 },
        },
        total: {
          type: 'number',
          value: 1250,
          source: { type: 'file', part: 1 },
        },
      },
      warnings: [],
    });
    await expect(
      extract({
        model,
        state: [
          { type: 'text', text: 'Header' },
          { type: 'file', mediaType: 'application/pdf', data: bytes },
          { type: 'text', text: 'INV-2041' },
        ],
        fields: {
          invoiceNumber: fields.invoiceNumber,
          total: fields.total,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('handles field ids that match object prototype properties', async () => {
    const specialFields = Object.fromEntries([
      ['__proto__', { type: 'text' }],
      ['constructor', { type: 'number' }],
    ]) as Record<string, ExtractionField>;
    const specialAnswers = Object.fromEntries([
      ['__proto__', { type: 'text', value: 'x' }],
      ['constructor', { type: 'number', value: 1 }],
    ]) as ExtractionModelV4Result['answers'];
    const result = await extract({
      ...setup({ answers: specialAnswers, warnings: [] }),
      state,
      fields: specialFields,
    });
    expect(Object.keys(result.answers)).toEqual(['__proto__', 'constructor']);
  });
});

it('retries transient errors with the configured retry limit', async () => {
  const { model, doExtract } = setup();
  doExtract.mockRejectedValueOnce(
    new APICallError({
      message: 'Rate limited',
      url: 'https://example.com',
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { 'retry-after-ms': '0' },
    }),
  );
  await expect(
    extract({ model, state, fields, maxRetries: 1 }),
  ).resolves.toBeDefined();
  expect(doExtract).toHaveBeenCalledTimes(2);
});

it('honors maxRetries: 0', async () => {
  const { model, doExtract } = setup();
  const error = new APICallError({
    message: 'Overloaded',
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode: 529,
  });
  doExtract.mockRejectedValue(error);
  await expect(extract({ model, state, fields, maxRetries: 0 })).rejects.toBe(
    error,
  );
  expect(doExtract).toHaveBeenCalledTimes(1);
});

it('does not call the provider when already aborted', async () => {
  const { model, doExtract } = setup();
  const controller = new AbortController();
  const reason = new Error('Cancelled');
  controller.abort(reason);
  await expect(
    extract({ model, state, fields, abortSignal: controller.signal }),
  ).rejects.toBe(reason);
  expect(doExtract).not.toHaveBeenCalled();
});

it('does not return a result after cancellation during a call', async () => {
  const { model, doExtract } = setup();
  const controller = new AbortController();
  const reason = new Error('Cancelled');
  doExtract.mockImplementation(async () => {
    controller.abort(reason);
    return { answers, warnings: [] };
  });
  await expect(
    extract({ model, state, fields, abortSignal: controller.signal }),
  ).rejects.toBe(reason);
});

it('sends JSON state as a JSON part', async () => {
  const { model, doExtract } = setup({
    answers: { invoiceNumber: { type: 'text', value: 'INV-2041' } },
    warnings: [],
  });
  await extract({
    model,
    state: { invoice: 'INV-2041' },
    fields: { invoiceNumber: fields.invoiceNumber },
  });
  expect(doExtract.mock.calls[0][0].state).toEqual([
    { type: 'json', value: { invoice: 'INV-2041' } },
  ]);
});

it.each([
  'https://attacker.example/invoice.pdf',
  new URL('https://attacker.example/invoice.pdf'),
  {
    type: 'url' as const,
    url: new URL('https://attacker.example/invoice.pdf'),
  },
])('rejects remote file state without a download hook (%s)', async data => {
  const { model, doExtract } = setup({
    answers: { invoiceNumber: { type: 'text', value: 'INV-2041' } },
    warnings: [],
  });
  const fetch = vi.fn().mockResolvedValue(
    new Response('invoice', {
      headers: { 'content-type': 'application/pdf' },
    }),
  );
  vi.stubGlobal('fetch', fetch);

  await expect(
    extract({
      model,
      fields: { invoiceNumber: fields.invoiceNumber },
      state: [{ type: 'file', mediaType: 'application/pdf', data }],
    }),
  ).rejects.toMatchObject({
    name: 'AI_DownloadError',
    message: expect.stringContaining('experimental_download'),
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(doExtract).not.toHaveBeenCalled();
});

it('stops before provider I/O when a file download fails', async () => {
  const { model, doExtract } = setup();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
  );
  await expect(
    extract({
      model,
      fields,
      experimental_download: createDownload(),
      state: [
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: new URL('https://example.com/invoice.pdf'),
        },
      ],
    }),
  ).rejects.toMatchObject({ name: 'AI_DownloadError', statusCode: 404 });
  expect(doExtract).not.toHaveBeenCalled();
});

it('uses the configured download transport and forwards cancellation', async () => {
  const { model, doExtract } = setup({
    answers: { invoiceNumber: { type: 'text', value: 'INV-2041' } },
    warnings: [],
  });
  const bytes = new TextEncoder().encode('Invoice INV-2041');
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      new Response(bytes, { headers: { 'content-type': 'application/pdf' } }),
    );
  const globalFetch = vi.fn();
  vi.stubGlobal('fetch', globalFetch);
  const abortSignal = new AbortController().signal;

  await extract({
    model,
    fields: { invoiceNumber: fields.invoiceNumber },
    state: [
      { type: 'text', text: 'Read the invoice.' },
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: new URL('https://example.com/invoice.pdf'),
      },
    ],
    abortSignal,
    experimental_download: createDownload({ fetch }),
  });

  expect(fetch).toHaveBeenCalledWith(
    'https://example.com/invoice.pdf',
    expect.objectContaining({ signal: abortSignal, redirect: 'manual' }),
  );
  expect(globalFetch).not.toHaveBeenCalled();
  expect(doExtract.mock.calls[0][0].state).toEqual([
    { type: 'text', text: 'Read the invoice.' },
    {
      type: 'file',
      mediaType: 'application/pdf',
      data: { type: 'data', data: bytes },
    },
  ]);
});

it('stops before provider I/O when the download transport blocks a URL', async () => {
  const { model, doExtract } = setup();
  const reason = new Error('Blocked private DNS address');
  const fetch = vi.fn().mockRejectedValue(reason);
  const globalFetch = vi.fn();
  vi.stubGlobal('fetch', globalFetch);

  await expect(
    extract({
      model,
      fields,
      state: [
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: new URL('https://attacker.example/invoice.pdf'),
        },
      ],
      experimental_download: createDownload({ fetch }),
    }),
  ).rejects.toMatchObject({ name: 'AI_DownloadError', cause: reason });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(globalFetch).not.toHaveBeenCalled();
  expect(doExtract).not.toHaveBeenCalled();
});
