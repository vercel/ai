import { APICallError, type LanguageModelV4Prompt } from '@ai-sdk/provider';
import { redactTelemetryValue } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { GatewayBatch } from './gateway-batch';
import { GatewayEmbeddingModel } from './gateway-embedding-model';
import { GatewayExtractionModel } from './gateway-extraction-model';
import { GatewayLanguageModel } from './gateway-language-model';

const BYOK_SECRET = 'sk-byok-telemetry-secret';
const BYOK = { openai: [{ apiKey: BYOK_SECRET }] };

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const server = createTestServer({
  'https://api.test.com/language-model': {},
  'https://api.test.com/extraction-model': {},
  'https://api.test.com/embedding-model': {},
  'https://api.test.com/batch/start': {},
});

const testConfig = () => ({
  provider: 'gateway',
  baseURL: 'https://api.test.com',
  headers: () => ({
    Authorization: 'Bearer test-token',
    'ai-gateway-auth-method': 'api-key',
  }),
  fetch: globalThis.fetch,
  o11yHeaders: {},
});

type TestUrl =
  | 'https://api.test.com/language-model'
  | 'https://api.test.com/extraction-model'
  | 'https://api.test.com/embedding-model'
  | 'https://api.test.com/batch/start';

function prepareErrorResponse(url: TestUrl) {
  server.urls[url].response = {
    type: 'error',
    status: 500,
    body: JSON.stringify({ error: { message: 'bad request' } }),
  };
}

/** The application-facing error keeps the body; only the telemetry view hides it. */
function expectTelemetryViewRedacted(body: unknown) {
  expect(JSON.stringify(body)).toContain(BYOK_SECRET);

  const telemetryView = redactTelemetryValue(body);
  expect(JSON.stringify(telemetryView)).not.toContain(BYOK_SECRET);
  expect(JSON.stringify(telemetryView)).toContain('[redacted]');
}

function getRequestBodyValues(error: unknown): unknown {
  const cause = (error as { cause?: unknown }).cause;
  if (!APICallError.isInstance(cause)) {
    throw new Error('expected the Gateway error to wrap an APICallError');
  }
  return cause.requestBodyValues;
}

async function captureError(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

describe('Gateway BYOK telemetry redaction', () => {
  it('redacts the error body of a failed generate call', async () => {
    prepareErrorResponse('https://api.test.com/language-model');

    const error = await captureError(() =>
      new GatewayLanguageModel('openai/gpt-5', testConfig()).doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: { gateway: { byok: BYOK } },
      }),
    );

    // The Gateway receives the credentials unchanged.
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      prompt: TEST_PROMPT,
      providerOptions: { gateway: { byok: BYOK } },
    });
    expectTelemetryViewRedacted(getRequestBodyValues(error));
    expect(JSON.stringify((error as Error).cause)).toContain(BYOK_SECRET);
  });

  it('redacts the error body of a failed stream call', async () => {
    prepareErrorResponse('https://api.test.com/language-model');

    const error = await captureError(() =>
      new GatewayLanguageModel('openai/gpt-5', testConfig()).doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        providerOptions: { gateway: { byok: BYOK } },
      }),
    );

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
      providerOptions: { gateway: { byok: BYOK } },
    });
    expectTelemetryViewRedacted(getRequestBodyValues(error));
    expect(JSON.stringify((error as Error).cause)).toContain(BYOK_SECRET);
  });

  it('redacts the request body metadata of a generate call', async () => {
    server.urls['https://api.test.com/language-model'].response = {
      type: 'json-value',
      body: {
        content: { type: 'text', text: 'Hello' },
        finish_reason: 'stop',
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      },
    };

    const { request } = await new GatewayLanguageModel(
      'openai/gpt-5',
      testConfig(),
    ).doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: { gateway: { byok: BYOK } },
    });

    expect(request?.body).toStrictEqual({
      prompt: TEST_PROMPT,
      providerOptions: { gateway: { byok: BYOK } },
    });
    expectTelemetryViewRedacted(request?.body);
  });

  it('redacts the request body metadata of a stream call', async () => {
    server.urls['https://api.test.com/language-model'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'finish',
          finishReason: 'stop',
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })}\n\n`,
      ],
    };

    const { request } = await new GatewayLanguageModel(
      'openai/gpt-5',
      testConfig(),
    ).doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
      providerOptions: { gateway: { byok: BYOK } },
    });

    expect(request?.body).toStrictEqual({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
      providerOptions: { gateway: { byok: BYOK } },
    });
    expectTelemetryViewRedacted(request?.body);
  });

  it('redacts the error body of a failed extraction call', async () => {
    prepareErrorResponse('https://api.test.com/extraction-model');

    const error = await captureError(() =>
      new GatewayExtractionModel('openai/gpt-5', testConfig()).doExtract({
        state: [{ type: 'text', text: 'Invoice INV-2041' }],
        fields: { invoiceNumber: { type: 'text' } },
        providerOptions: { gateway: { byok: BYOK } },
      }),
    );

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      providerOptions: { gateway: { byok: BYOK } },
    });
    expectTelemetryViewRedacted(getRequestBodyValues(error));
    expect(JSON.stringify((error as Error).cause)).toContain(BYOK_SECRET);
  });

  it('redacts the error body of a failed embedding call', async () => {
    prepareErrorResponse('https://api.test.com/embedding-model');

    const error = await captureError(() =>
      new GatewayEmbeddingModel(
        'openai/text-embedding-3-small',
        testConfig(),
      ).doEmbed({
        values: ['sunny day'],
        providerOptions: { gateway: { byok: BYOK } },
      }),
    );

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      providerOptions: { gateway: { byok: BYOK } },
    });
    expectTelemetryViewRedacted(getRequestBodyValues(error));
    expect(JSON.stringify((error as Error).cause)).toContain(BYOK_SECRET);
  });

  it('redacts BYOK credentials in batch request options on errors', async () => {
    prepareErrorResponse('https://api.test.com/batch/start');

    const error = await captureError(() =>
      new GatewayBatch(testConfig()).doStartBatch({
        requests: [
          {
            id: 'req-1',
            type: 'text',
            modelId: 'openai/gpt-5',
            options: {
              prompt: TEST_PROMPT,
              providerOptions: { gateway: { byok: BYOK } },
            },
          },
        ],
        providerOptions: { gateway: { byok: BYOK } },
      }),
    );

    const requestBodyValues = getRequestBodyValues(error);
    expect(JSON.stringify(requestBodyValues)).toContain(BYOK_SECRET);
    const telemetryView = JSON.stringify(
      redactTelemetryValue(requestBodyValues),
    );
    expect(telemetryView).not.toContain(BYOK_SECRET);
    expect(telemetryView).toContain('[redacted]');
  });
});
