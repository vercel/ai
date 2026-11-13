import { describe, expect, test } from 'vitest';
import {
  readFxModelResponse,
  type FxModelStreamPart,
} from './fx-model-response';
import { readFixture } from './test-helpers';

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

describe('readFxModelResponse', () => {
  test('returns the exact body and the summary of the finish part', async () => {
    const body = await readFixture({ name: 'gateway-text.sse.txt' });
    const parts: FxModelStreamPart[] = [];

    const result = await readFxModelResponse({
      response: streamResponse([body.slice(0, 100), body.slice(100)]),
      onPart: part => parts.push(part),
    });

    expect(result.body).toBe(body);
    expect(result.summary?.finishReason).toEqual({
      unified: 'stop',
      raw: 'end_turn',
    });
    expect(parts.map(part => part.type)).toMatchInlineSnapshot(`
      [
        "stream-start",
        "response-metadata",
        "custom",
        "text-start",
        "text-delta",
        "text-end",
        "finish",
      ]
    `);
  });

  test('returns no summary for a response without a finish part', async () => {
    const result = await readFxModelResponse({
      response: streamResponse([
        'data: {"type":"text-start","id":"0"}\n\ndata: not json\n\n',
      ]),
      onPart: () => {},
    });

    expect(result).toEqual({
      body: 'data: {"type":"text-start","id":"0"}\n\ndata: not json\n\n',
    });
  });
});
