import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createBedrockMantle } from './bedrock-mantle-provider';
import { createNormalizeResponsesErrorFramesFetch } from './normalize-responses-error-frames';

function sseResponse(frames: string[]): Response {
  return new Response(frames.join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function fetchBody(fetchImpl: FetchFunction): Promise<string> {
  const wrapped = createNormalizeResponsesErrorFramesFetch(fetchImpl);
  const response = await wrapped('https://mantle.test/v1/responses', {});
  return response.text();
}

const VALID_DELTA =
  'data: {"type":"response.output_text.delta","sequence_number":5,"content_index":0,"delta":"DO","item_id":"msg_1","output_index":0}\n\n';

describe('createNormalizeResponsesErrorFramesFetch', () => {
  it('passes non-SSE responses through untouched', async () => {
    const baseFetch = vi
      .fn<FetchFunction>()
      .mockResolvedValue(
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const wrapped = createNormalizeResponsesErrorFramesFetch(baseFetch);
    const response = await wrapped('https://mantle.test/v1/responses', {});

    expect(response).toBe(await baseFetch.mock.results[0].value);
  });

  it('normalizes a typeless AWS error object into an error event', async () => {
    const body = await fetchBody(
      vi
        .fn<FetchFunction>()
        .mockResolvedValue(
          sseResponse([
            VALID_DELTA,
            'data: {"message":"The system encountered an unexpected error during processing. Try your request again."}\n\n',
          ]),
        ),
    );

    const normalized = JSON.parse(body.split('\n\n')[1].replace(/^data: /, ''));
    expect(normalized).toEqual({
      type: 'error',
      sequence_number: 6,
      code: null,
      message:
        'The system encountered an unexpected error during processing. Try your request again.',
      param: null,
    });
  });

  it('lifts the message out of an error event with a stringified JSON payload', async () => {
    const body = await fetchBody(
      vi
        .fn<FetchFunction>()
        .mockResolvedValue(
          sseResponse([
            VALID_DELTA,
            'data: {"type":"error","error":"{\\"message\\":\\"Too many requests, please wait before trying again.\\"}"}\n\n',
          ]),
        ),
    );

    const normalized = JSON.parse(body.split('\n\n')[1].replace(/^data: /, ''));
    expect(normalized).toMatchObject({
      type: 'error',
      sequence_number: 6,
      message: 'Too many requests, please wait before trying again.',
    });
  });

  it('normalizes an error event missing sequence_number', async () => {
    const body = await fetchBody(
      vi
        .fn<FetchFunction>()
        .mockResolvedValue(
          sseResponse([
            VALID_DELTA,
            'data: {"type":"error","code":"throttling","message":"slow down"}\n\n',
          ]),
        ),
    );

    const normalized = JSON.parse(body.split('\n\n')[1].replace(/^data: /, ''));
    expect(normalized).toEqual({
      type: 'error',
      sequence_number: 6,
      code: 'throttling',
      message: 'slow down',
      param: null,
    });
  });

  it('normalizes a nested error event with a null code', async () => {
    const body = await fetchBody(
      vi
        .fn<FetchFunction>()
        .mockResolvedValue(
          sseResponse([
            VALID_DELTA,
            'data: {"type":"error","error":{"type":"model_error","code":null,"message":"The model produced invalid content.","param":null},"sequence_number":8}\n\n',
          ]),
        ),
    );

    const normalized = JSON.parse(body.split('\n\n')[1].replace(/^data: /, ''));
    expect(normalized).toEqual({
      type: 'error',
      sequence_number: 9,
      code: null,
      message: 'The model produced invalid content.',
      param: null,
    });
  });

  it('passes well-formed frames through byte-identical', async () => {
    const validError =
      'data: {"type":"error","sequence_number":6,"code":"server_error","message":"boom","param":null}\n\n';
    const done = 'data: [DONE]\n\n';
    const body = await fetchBody(
      vi
        .fn<FetchFunction>()
        .mockResolvedValue(sseResponse([VALID_DELTA, validError, done])),
    );

    expect(body).toBe([VALID_DELTA, validError, done].join(''));
  });

  it('leaves unrecognized frames (non-JSON, arrays, unknown typed events) unchanged', async () => {
    const unknownTyped =
      'data: {"type":"response.some_future_event","sequence_number":6}\n\n';
    const notJson = 'data: {not json\n\n';
    const arrayFrame = 'data: [1,2,3]\n\n';
    const body = await fetchBody(
      vi
        .fn<FetchFunction>()
        .mockResolvedValue(sseResponse([unknownTyped, notJson, arrayFrame])),
    );

    expect(body).toBe([unknownTyped, notJson, arrayFrame].join(''));
  });

  it('passes prototype-pollution payloads through untouched', async () => {
    const polluted =
      'data: {"__proto__": {"polluted": true}, "message": "x"}\n\n';
    const body = await fetchBody(
      vi.fn<FetchFunction>().mockResolvedValue(sseResponse([polluted])),
    );

    expect(body).toBe(polluted);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('reassembles frames split across stream chunks', async () => {
    const full =
      VALID_DELTA +
      'data: {"message":"The system encountered an unexpected error during processing."}\n\n';
    // Split mid-frame.
    const splitAt = VALID_DELTA.length + 20;
    const baseFetch = vi.fn<FetchFunction>().mockResolvedValue(
      new Response(
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue(full.slice(0, splitAt));
            controller.enqueue(full.slice(splitAt));
            controller.close();
          },
        }).pipeThrough(new TextEncoderStream()),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
    );

    const wrapped = createNormalizeResponsesErrorFramesFetch(baseFetch);
    const response = await wrapped('https://mantle.test/v1/responses', {});
    const body = await response.text();

    expect(body).toContain(
      'data: {"type":"error","sequence_number":6,"code":null,"message":"The system encountered an unexpected error during processing.","param":null}',
    );
  });
});

describe('bedrock mantle responses stream normalization (end-to-end)', () => {
  const server = createTestServer({
    'https://mantle.test/v1/responses': {},
  });

  const prompt: LanguageModelV4Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ];

  it('surfaces a typeless Bedrock terminal error frame as a stream error, not a validation failure', async () => {
    server.urls['https://mantle.test/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: [
        'data: {"type":"response.created","response":{"id":"resp_1","created_at":1788359294,"model":"openai.gpt-5.6-sol","object":"response","output":[],"parallel_tool_calls":false,"status":"in_progress","error":null,"incomplete_details":null,"instructions":null},"sequence_number":0}\n\n',
        'data: {"type":"response.output_text.delta","sequence_number":1,"content_index":0,"delta":"DONE","item_id":"msg_1","output_index":0}\n\n',
        'data: {"message":"The system encountered an unexpected error during processing. Try your request again."}\n\n',
      ],
    };

    const provider = createBedrockMantle({
      apiKey: 'test-key',
      baseURL: 'https://mantle.test/v1',
      region: 'us-east-1',
    });
    const model = provider.responses('openai.gpt-5.6-sol');

    const { stream } = await model.doStream({ prompt });
    const parts = await convertReadableStreamToArray(stream);

    const errorPart = parts.find(part => part.type === 'error');
    expect(errorPart).toBeDefined();
    const error = (errorPart as { error: unknown }).error;
    expect(error).not.toMatchObject({ name: 'AI_TypeValidationError' });
    expect(String((error as { message?: unknown })?.message)).toContain(
      'The system encountered an unexpected error during processing',
    );
  });
});
