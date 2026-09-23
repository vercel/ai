import type { UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';
import type { ModelCallStreamPart } from './do-stream-step.js';
import { normalizeUIMessageStreamParts } from './normalize-ui-message-stream.js';
import {
  createModelCallToUIChunkTransform,
  toUIMessageChunk,
} from './to-ui-message-chunk.js';

async function transform(
  parts: ModelCallStreamPart[],
  options?: { uiStartIndex?: number },
) {
  const stream = new ReadableStream<ModelCallStreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  }).pipeThrough(createModelCallToUIChunkTransform(options));

  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return chunks;
}

const rawToolTurn = [
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', text: 'Checking' },
  { type: 'text-end', id: 'text-1' },
  { type: 'tool-input-start', id: 'call-1', toolName: 'weather' },
  { type: 'tool-input-delta', id: 'call-1', delta: '{"city":"London"}' },
  { type: 'tool-input-end', id: 'call-1' },
  {
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'weather',
    input: { city: 'London' },
  },
  {
    type: 'tool-result',
    toolCallId: 'call-1',
    toolName: 'weather',
    input: { city: 'London' },
    output: { temperature: 18 },
  },
  { type: 'text-start', id: 'text-2' },
  { type: 'text-delta', id: 'text-2', text: 'It is 18°C.' },
  { type: 'text-end', id: 'text-2' },
] as unknown as ModelCallStreamPart[];

const resumeFixtures: Array<{
  name: string;
  parts: ModelCallStreamPart[];
}> = [
  {
    name: 'text',
    parts: [
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'Hello' },
      { type: 'text-end', id: 'text-1' },
    ] as ModelCallStreamPart[],
  },
  {
    name: 'tool call',
    parts: rawToolTurn,
  },
  {
    name: 'tool error',
    parts: [
      { type: 'tool-input-start', id: 'call-1', toolName: 'weather' },
      { type: 'tool-input-delta', id: 'call-1', delta: '{}' },
      { type: 'tool-input-end', id: 'call-1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: {},
      },
      {
        type: 'tool-error',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: {},
        error: new Error('Weather lookup failed'),
      },
    ] as unknown as ModelCallStreamPart[],
  },
  {
    name: 'ignored raw parts',
    parts: [
      { type: 'text-start', id: 'text-1' },
      { type: 'model-call-start' },
      { type: 'model-call-response-metadata' },
      { type: 'raw', rawValue: { ignored: true } },
      { type: 'text-end', id: 'text-1' },
    ] as unknown as ModelCallStreamPart[],
  },
  {
    name: 'step boundaries',
    parts: [
      { type: 'text-start', id: 'text-1' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish-step' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-2' },
      { type: 'text-end', id: 'text-2' },
    ] as unknown as ModelCallStreamPart[],
  },
  {
    name: 'signed tool approval',
    parts: [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'London' },
      },
      {
        type: 'tool-approval-request',
        approvalId: 'approval-call-1',
        toolCallId: 'call-1',
        signature: 'signed-approval',
      },
    ] as ModelCallStreamPart[],
  },
];

describe('createModelCallToUIChunkTransform', () => {
  it('preserves the existing output when options are omitted', async () => {
    await expect(
      transform([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', text: 'Hello' },
        { type: 'text-end', id: 'text-1' },
      ] as ModelCallStreamPart[]),
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

  it('resumes in UI chunk index space', async () => {
    const canonical = await transform(rawToolTurn);

    expect(canonical).toHaveLength(14);
    expect(canonical.slice(4, 7).map(chunk => chunk.type)).toEqual([
      'text-end',
      'tool-input-start',
      'tool-input-delta',
    ]);
    expect(await transform(rawToolTurn, { uiStartIndex: 4 })).toEqual(
      canonical.slice(4),
    );
  });

  it.each(resumeFixtures)(
    'reconstructs the canonical $name stream at every cursor',
    async ({ parts }) => {
      const canonical = await transform(parts);

      for (let cursor = 0; cursor <= canonical.length; cursor++) {
        const resumed = await transform(parts, { uiStartIndex: cursor });

        expect(canonical.slice(0, cursor).concat(resumed)).toEqual(canonical);
      }
    },
  );

  it('omits the full stream when the UI cursor is past the end', async () => {
    await expect(
      transform(rawToolTurn, { uiStartIndex: 100 }),
    ).resolves.toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, null])(
    'rejects invalid UI start index %s',
    uiStartIndex => {
      expect(() =>
        createModelCallToUIChunkTransform({
          uiStartIndex: uiStartIndex as number,
        }),
      ).toThrowError('uiStartIndex must be a non-negative safe integer');
    },
  );
});

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

describe('workflow signed tool approvals', () => {
  it('preserves the approval signature in the UI message chunk', () => {
    expect(
      toUIMessageChunk({
        type: 'tool-approval-request',
        approvalId: 'approval-call-1',
        toolCallId: 'call-1',
        signature: 'signed-approval',
      }),
    ).toEqual({
      type: 'tool-approval-request',
      approvalId: 'approval-call-1',
      toolCallId: 'call-1',
      signature: 'signed-approval',
    });
  });
});
