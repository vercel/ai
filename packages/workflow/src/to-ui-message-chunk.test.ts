import type { UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import type { ModelCallStreamPart } from './do-stream-step.js';
import { normalizeUIMessageStreamParts } from './normalize-ui-message-stream.js';
import {
  createModelCallToUIChunkTransform,
  toUIMessageChunk,
} from './to-ui-message-chunk.js';
import { WorkflowChatTransport } from './workflow-chat-transport.js';

describe('workflow UI stream reset-step', () => {
  it('converts reset-step model-call parts to UI message chunks', () => {
    expect(toUIMessageChunk({ type: 'reset-step' })).toEqual({
      type: 'reset-step',
    });
  });

  it('starts a new normalization frame after reset-step', async () => {
    const source = (async function* () {
      yield { type: 'text-start' as const, id: 'text-1' };
      yield { type: 'reset-step' as const };
      yield { type: 'text-start' as const, id: 'text-1' };
      yield { type: 'text-delta' as const, id: 'text-1', delta: 'retry' };
      yield { type: 'text-end' as const, id: 'text-1' };
    })();

    const chunks = [];
    for await (const chunk of normalizeUIMessageStreamParts(source)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'text-start', id: 'text-1' },
      { type: 'reset-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'retry' },
      { type: 'text-end', id: 'text-1' },
    ]);
  });
});

function rawStream(parts: readonly ModelCallStreamPart[], startIndex = 0) {
  return new ReadableStream<ModelCallStreamPart>({
    start(controller) {
      for (const part of parts.slice(startIndex)) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}

async function collect(
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

function sseStream(chunks: readonly UIMessageChunk[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }
      controller.close();
    },
  });
}

const toolCallParts = [
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', text: 'Checking the weather.' },
  { type: 'text-end', id: 'text-1' },
  { type: 'tool-input-start', id: 'call-1', toolName: 'getWeather' },
  { type: 'tool-input-delta', id: 'call-1', delta: '{"city":"Boston"}' },
  { type: 'tool-input-end', id: 'call-1' },
  {
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'getWeather',
    input: { city: 'Boston' },
  },
  {
    type: 'tool-result',
    toolCallId: 'call-1',
    toolName: 'getWeather',
    input: { city: 'Boston' },
    output: { temperature: 22, unit: 'celsius' },
  },
  { type: 'text-start', id: 'text-2' },
  { type: 'text-delta', id: 'text-2', text: 'It is 22°C.' },
  { type: 'text-end', id: 'text-2' },
] as unknown as ModelCallStreamPart[];

const textParts = [
  { type: 'model-call-start', options: {} },
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', text: 'Hello' },
  { type: 'raw', rawValue: { provider: 'ignored' } },
  { type: 'text-end', id: 'text-1' },
] as unknown as ModelCallStreamPart[];

const toolErrorParts = [
  { type: 'tool-input-start', id: 'call-2', toolName: 'getWeather' },
  { type: 'tool-input-delta', id: 'call-2', delta: '{"city":"Mars"}' },
  { type: 'tool-input-end', id: 'call-2' },
  {
    type: 'tool-call',
    toolCallId: 'call-2',
    toolName: 'getWeather',
    input: { city: 'Mars' },
  },
  {
    type: 'tool-error',
    toolCallId: 'call-2',
    toolName: 'getWeather',
    input: { city: 'Mars' },
    error: 'City not found',
  },
] as unknown as ModelCallStreamPart[];

const stepBoundaryParts = [
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', text: 'First step' },
  { type: 'text-end', id: 'text-1' },
  { type: 'finish-step' },
  { type: 'start-step' },
  { type: 'text-start', id: 'text-2' },
  { type: 'text-delta', id: 'text-2', text: 'Second step' },
  { type: 'text-end', id: 'text-2' },
] as unknown as ModelCallStreamPart[];

const fixtures = [
  ['text with ignored raw parts', textParts],
  ['tool call', toolCallParts],
  ['tool error', toolErrorParts],
  ['step boundaries', stepBoundaryParts],
] as const;

describe('createModelCallToUIChunkTransform', () => {
  it('preserves the existing output when options are omitted', async () => {
    await expect(
      collect(
        rawStream(textParts).pipeThrough(createModelCallToUIChunkTransform()),
      ),
    ).resolves.toEqual([
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);
  });

  describe.each(fixtures)('resuming %s', (_name, parts) => {
    it('returns the canonical suffix at every UI chunk index', async () => {
      const canonical = await collect(
        rawStream(parts).pipeThrough(createModelCallToUIChunkTransform()),
      );

      for (
        let uiStartIndex = 0;
        uiStartIndex <= canonical.length;
        uiStartIndex++
      ) {
        const resumed = await collect(
          rawStream(parts).pipeThrough(
            createModelCallToUIChunkTransform({ uiStartIndex }),
          ),
        );

        expect(resumed).toEqual(canonical.slice(uiStartIndex));
        expect([...canonical.slice(0, uiStartIndex), ...resumed]).toEqual(
          canonical,
        );
      }
    });
  });

  it('returns no chunks when the UI chunk index is beyond a completed stream', async () => {
    const resumed = await collect(
      rawStream(textParts).pipeThrough(
        createModelCallToUIChunkTransform({ uiStartIndex: 100 }),
      ),
    );

    expect(resumed).toEqual([]);
  });

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid UI chunk index %s', uiStartIndex => {
    expect(() => createModelCallToUIChunkTransform({ uiStartIndex })).toThrow(
      new RangeError('uiStartIndex must be a non-negative safe integer'),
    );
  });

  it('counts lifecycle and mapped chunks but not ignored raw parts', async () => {
    const resumed = await collect(
      rawStream(textParts).pipeThrough(
        createModelCallToUIChunkTransform({ uiStartIndex: 3 }),
      ),
    );

    expect(resumed[0]).toEqual({
      type: 'text-delta',
      id: 'text-1',
      delta: 'Hello',
    });
  });

  it('composes with WorkflowChatTransport across an interrupted tool stream', async () => {
    const canonical = await collect(
      rawStream(toolCallParts).pipeThrough(createModelCallToUIChunkTransform()),
    );
    const interruptedAt = 4;
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/chat') {
        return new Response(sseStream(canonical.slice(0, interruptedAt)), {
          headers: { 'x-workflow-run-id': 'run-1' },
        });
      }

      const uiStartIndex = Number(
        new URL(url, 'http://localhost').searchParams.get('startIndex'),
      );
      const resumed = await collect(
        rawStream(toolCallParts).pipeThrough(
          createModelCallToUIChunkTransform({ uiStartIndex }),
        ),
      );
      return new Response(sseStream(resumed));
    });
    const transport = new WorkflowChatTransport({
      fetch: mockFetch as unknown as typeof fetch,
    });

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messages: [],
    });

    await expect(collect(stream)).resolves.toEqual(canonical);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `/api/chat/run-1/stream?startIndex=${interruptedAt}`,
      expect.any(Object),
    );
  });
});
