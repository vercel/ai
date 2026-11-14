import {
  Experimental_ExtractionUnsupportedFieldTypeError as ExtractionUnsupportedFieldTypeError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import { describe, it, expect } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createGateway } from './gateway-provider';
import { GatewayExtractionModel } from './gateway-extraction-model';
import type { GatewayConfig } from './gateway-config';
import {
  GatewayInvalidRequestError,
  GatewayInternalServerError,
} from './errors';

const testState = [
  { type: 'text', text: 'Invoice INV-2041 from Acme. Total due $1,250.00.' },
] as const;

const testFields = {
  invoiceNumber: { type: 'text', instructions: 'The invoice number' },
  total: { type: 'number', instructions: 'Total amount due', decimals: 2 },
  contacts: { type: 'list', items: 'text' },
} as const;

const dummyAnswers = {
  invoiceNumber: {
    type: 'text',
    value: 'INV-2041',
    confidence: 0.98,
    pNull: 0.01,
    source: { type: 'text', part: 0, start: 8, end: 16 },
  },
  total: { type: 'number', value: 1250, guess: 1250 },
  contacts: { type: 'list', value: null },
};

const server = createTestServer({
  'https://api.test.com/extraction-model': {},
});

const createTestModel = (
  config: Partial<
    GatewayConfig & { o11yHeaders?: Record<string, string> }
  > = {},
) =>
  new GatewayExtractionModel('scaledown/extract-1', {
    provider: 'gateway',
    baseURL: 'https://api.test.com',
    headers: () => ({
      Authorization: 'Bearer test-token',
      'ai-gateway-auth-method': 'api-key',
    }),
    fetch: globalThis.fetch,
    o11yHeaders: config.o11yHeaders || {},
    ...config,
  });

function prepareJsonResponse(
  body: Record<string, unknown> = {},
  headers?: Record<string, string>,
) {
  server.urls['https://api.test.com/extraction-model'].response = {
    type: 'json-value',
    headers,
    body: { answers: dummyAnswers, ...body },
  };
}

function prepareErrorResponse(status: number, error: Record<string, unknown>) {
  server.urls['https://api.test.com/extraction-model'].response = {
    type: 'error',
    status,
    body: JSON.stringify({ error }),
  };
}

describe('GatewayExtractionModel', () => {
  it('should report every field type as supported', () => {
    expect(createTestModel().supportedFieldTypes).toStrictEqual([
      'text',
      'number',
      'date',
      'time',
      'datetime',
      'duration',
      'list',
    ]);
  });

  it('should create the model from both provider factories', () => {
    const provider = createGateway({
      baseURL: 'https://api.test.com',
      apiKey: 'test-token',
    });
    expect(provider.extraction).toBe(provider.extractionModel);
    const model = provider.extractionModel('scaledown/extract-1');
    expect(model).toBeInstanceOf(GatewayExtractionModel);
    expect(model.provider).toBe('gateway');
    expect(model.modelId).toBe('scaledown/extract-1');
  });

  describe('state parts', () => {
    const statePartsCases: { name: string; state: DecisionModelV4State }[] = [
      { name: 'a text part', state: [{ type: 'text', text: 'Inspect.' }] },
      {
        name: 'a JSON part',
        state: [{ type: 'json', value: { product: 'vase', history: ['new'] } }],
      },
      {
        name: 'mixed parts',
        state: [
          { type: 'text', text: 'Inspect.' },
          { type: 'json', value: { product: 'vase' } },
          { type: 'text', text: 'Again.' },
        ],
      },
    ];

    it.each(statePartsCases)(
      'sends $name as ordered state parts',
      async ({ state }) => {
        prepareJsonResponse();
        await createTestModel().doExtract({ state, fields: testFields });
        expect(await server.calls[0].requestBodyJson).toEqual({
          stateParts: state,
          fields: testFields,
        });
      },
    );

    it('sends file bytes as base64 in ordered state parts', async () => {
      prepareJsonResponse();
      await createTestModel().doExtract({
        state: [
          { type: 'text', text: 'Read this invoice.' },
          {
            type: 'file',
            mediaType: 'application/pdf',
            filename: 'invoice.pdf',
            data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
          },
        ],
        fields: testFields,
      });

      expect((await server.calls[0].requestBodyJson).stateParts).toEqual([
        { type: 'text', text: 'Read this invoice.' },
        {
          type: 'file',
          mediaType: 'application/pdf',
          filename: 'invoice.pdf',
          data: { type: 'data', data: 'AQID' },
        },
      ]);
    });

    it('sends base64 file strings unchanged', async () => {
      prepareJsonResponse();
      const file = {
        type: 'file' as const,
        mediaType: 'image/jpeg',
        data: { type: 'data' as const, data: 'AQID' },
      };
      await createTestModel().doExtract({ state: [file], fields: testFields });

      expect((await server.calls[0].requestBodyJson).stateParts).toEqual([
        file,
      ]);
    });

    it('sends file references unchanged', async () => {
      prepareJsonResponse();
      const file = {
        type: 'file' as const,
        mediaType: 'application/pdf',
        data: {
          type: 'reference' as const,
          reference: { gateway: 'file_123' },
        },
      };
      await createTestModel().doExtract({ state: [file], fields: testFields });

      expect((await server.calls[0].requestBodyJson).stateParts).toEqual([
        file,
      ]);
    });

    it.each([
      {
        type: 'url',
        data: {
          type: 'url' as const,
          url: new URL('https://example.com/a.pdf'),
        },
      },
      { type: 'text', data: { type: 'text' as const, text: 'Invoice' } },
    ])(
      'rejects $type file data before sending a Gateway request',
      async ({ type, data }) => {
        await expect(
          createTestModel().doExtract({
            state: [{ type: 'file', mediaType: 'application/pdf', data }],
            fields: testFields,
          }),
        ).rejects.toMatchObject({
          name: 'AI_UnsupportedFunctionalityError',
          functionality: `Gateway extraction file input: ${type} data`,
        });
        expect(server.calls).toHaveLength(0);
      },
    );
  });

  describe('doExtract', () => {
    it('should post to the /extraction-model endpoint', async () => {
      prepareJsonResponse();
      await createTestModel().doExtract({
        state: testState,
        fields: testFields,
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.test.com/extraction-model',
      );
    });

    it('should send every call option in the request body', async () => {
      prepareJsonResponse();
      await createTestModel().doExtract({
        state: testState,
        fields: testFields,
        referenceDate: '2026-11-11',
        maxOutputTokens: 512,
        reasoning: 'low',
        providerOptions: {
          gateway: { models: ['openai/gpt-5.4-nano'], user: 'user-123' },
          scaledown: { threshold: 0.4 },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        stateParts: testState,
        fields: testFields,
        referenceDate: '2026-11-11',
        maxOutputTokens: 512,
        reasoning: 'low',
        providerOptions: {
          gateway: { models: ['openai/gpt-5.4-nano'], user: 'user-123' },
          scaledown: { threshold: 0.4 },
        },
      });
    });

    it('should omit options that are not set', async () => {
      prepareJsonResponse();
      await createTestModel().doExtract({
        state: testState,
        fields: testFields,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        stateParts: testState,
        fields: testFields,
      });
    });

    it('should pass headers correctly', async () => {
      prepareJsonResponse();
      await createTestModel({
        o11yHeaders: { 'ai-o11y-region': 'iad1' },
      }).doExtract({
        state: testState,
        fields: testFields,
        headers: { 'Custom-Header': 'test-value' },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-token',
        'custom-header': 'test-value',
        'ai-extraction-model-specification-version': '4',
        'ai-model-id': 'scaledown/extract-1',
        'ai-o11y-region': 'iad1',
      });
    });

    it('should return answers of every type', async () => {
      const answers = {
        text: {
          type: 'text',
          value: 'INV-2041',
          guess: 'INV-2041',
          pNull: 0.01,
          confidence: 0.98,
          source: { type: 'text', part: 0, start: 8, end: 16 },
        },
        number: { type: 'number', value: 1250 },
        date: { type: 'date', value: '2026-03-03' },
        time: { type: 'time', value: '17:30' },
        datetime: { type: 'datetime', value: '2026-03-03T17:30:00Z' },
        duration: { type: 'duration', value: 120 },
        missing: { type: 'text', value: null, guess: 'PO-1', pNull: 0.9 },
        fromFile: {
          type: 'text',
          value: 'Acme',
          source: { type: 'file', part: 1 },
        },
        texts: {
          type: 'list',
          value: ['Ana', 'Bo'],
          confidence: 0.9,
          items: [
            {
              confidence: 0.95,
              source: { type: 'text', part: 0, start: 1, end: 4 },
            },
            {},
          ],
        },
        numbers: { type: 'list', value: [1, 2.5] },
        emptyList: { type: 'list', value: [] },
        missingList: { type: 'list', value: null, pNull: 0.8 },
      };
      prepareJsonResponse({ answers });

      const result = await createTestModel().doExtract({
        state: testState,
        fields: testFields,
      });

      expect(result.answers).toStrictEqual(answers);
    });

    it('should return refusal answers', async () => {
      const answers = {
        invoiceNumber: { type: 'refusal' },
        total: { type: 'number', value: 1250 },
        contacts: { type: 'refusal' },
      };
      prepareJsonResponse({ answers });

      const result = await createTestModel().doExtract({
        state: testState,
        fields: testFields,
      });

      expect(result.answers).toStrictEqual(answers);
    });

    it('should return usage, warnings, and provider metadata', async () => {
      const warnings = [
        { type: 'unsupported', feature: 'reasoning', details: 'Ignored.' },
        { type: 'other', message: 'Something else.' },
      ];
      prepareJsonResponse({
        usage: { inputTokens: 120, outputTokens: 30 },
        warnings,
        providerMetadata: { gateway: { cost: '0.002' } },
      });

      const result = await createTestModel().doExtract({
        state: testState,
        fields: testFields,
      });

      expect(result.usage).toStrictEqual({
        inputTokens: 120,
        outputTokens: 30,
      });
      expect(result.warnings).toStrictEqual(warnings);
      expect(result.providerMetadata).toStrictEqual({
        gateway: { cost: '0.002' },
      });
    });

    it('should omit usage and default warnings when absent', async () => {
      prepareJsonResponse();

      const result = await createTestModel().doExtract({
        state: testState,
        fields: testFields,
      });

      expect(result).not.toHaveProperty('usage');
      expect(result.warnings).toStrictEqual([]);
    });

    it('should return response metadata', async () => {
      prepareJsonResponse(
        { model: 'scaledown/extract-1-fallback' },
        { 'x-request-id': 'req-1' },
      );

      const result = await createTestModel().doExtract({
        state: testState,
        fields: testFields,
      });

      expect(result.response?.modelId).toBe('scaledown/extract-1-fallback');
      expect(result.response?.headers).toMatchObject({
        'x-request-id': 'req-1',
      });
      expect(result.response?.body).toStrictEqual({
        answers: dummyAnswers,
        model: 'scaledown/extract-1-fallback',
      });
    });

    it('should attribute the response to the requested model when none is returned', async () => {
      prepareJsonResponse();

      const result = await createTestModel().doExtract({
        state: testState,
        fields: testFields,
      });

      expect(result.response?.modelId).toBe('scaledown/extract-1');
    });
  });

  describe('error handling', () => {
    it('should throw ExtractionUnsupportedFieldTypeError for an unsupported field type', async () => {
      prepareErrorResponse(400, {
        message:
          'Field "total" has type "number", which is not supported by provider "upstream.extraction" and model "extract-1".',
        type: 'invalid_request_error',
        param: {
          name: 'AI_ExtractionUnsupportedFieldTypeError',
          fieldId: 'total',
          fieldType: 'number',
          statusCode: 400,
        },
      });

      const error = await createTestModel()
        .doExtract({ state: testState, fields: testFields })
        .catch(error => error);

      expect(ExtractionUnsupportedFieldTypeError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        fieldId: 'total',
        fieldType: 'number',
        provider: 'gateway',
        modelId: 'scaledown/extract-1',
        message:
          'Field "total" has type "number", which is not supported by provider "gateway" and model "scaledown/extract-1".',
      });
    });

    it('should keep the list item type of an unsupported list field', async () => {
      prepareErrorResponse(400, {
        message: 'Unsupported field type.',
        type: 'invalid_request_error',
        param: {
          name: 'AI_ExtractionUnsupportedFieldTypeError',
          fieldId: 'contacts',
          fieldType: 'list<number>',
        },
      });

      await expect(
        createTestModel().doExtract({ state: testState, fields: testFields }),
      ).rejects.toMatchObject({
        name: 'AI_ExtractionUnsupportedFieldTypeError',
        fieldId: 'contacts',
        fieldType: 'list<number>',
      });
    });

    it.each([
      { name: 'no param', param: undefined },
      {
        name: 'another error class',
        param: {
          name: 'AI_InvalidArgumentError',
          fieldId: 'a',
          fieldType: 'b',
        },
      },
      {
        name: 'no field',
        param: { name: 'AI_ExtractionUnsupportedFieldTypeError' },
      },
    ])(
      'should throw GatewayInvalidRequestError on a 400 with $name',
      async ({ param }) => {
        prepareErrorResponse(400, {
          message: 'Invalid fields format',
          type: 'invalid_request_error',
          ...(param ? { param } : {}),
        });

        await expect(
          createTestModel().doExtract({ state: testState, fields: testFields }),
        ).rejects.toSatisfy(
          err =>
            GatewayInvalidRequestError.isInstance(err) &&
            err.statusCode === 400 &&
            err.message === 'Invalid fields format',
        );
      },
    );

    it('should throw GatewayInternalServerError on 500', async () => {
      prepareErrorResponse(500, {
        message: 'Internal server error',
        type: 'internal_server_error',
      });

      await expect(
        createTestModel().doExtract({ state: testState, fields: testFields }),
      ).rejects.toSatisfy(
        err =>
          GatewayInternalServerError.isInstance(err) && err.statusCode === 500,
      );
    });
  });
});
