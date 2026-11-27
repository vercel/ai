import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
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

  it('preserves transformed tool input through the UI stream', async () => {
    await expect(
      transform([
        {
          type: 'tool-approval-request',
          approvalId: 'approval-call-1',
          toolCallId: 'call-1',
          inputSchemaInput: { value: ' requested ' },
        },
      ]),
    ).resolves.toContainEqual({
      type: 'tool-approval-request',
      approvalId: 'approval-call-1',
      toolCallId: 'call-1',
      inputSchemaInput: { value: ' requested ' },
    });
  });
});

describe('model step executions in createModelCallToUIChunkTransform', () => {
  function execution(attemptId: string, text: string): ModelCallStreamPart[] {
    return [
      { type: 'reset-step', attemptId },
      { type: 'text-start', id: '0', attemptId },
      ...(text.match(/.{1,6}/g) ?? []).map(delta => ({
        type: 'text-delta' as const,
        id: '0',
        text: delta,
        attemptId,
      })),
      { type: 'text-end', id: '0', attemptId },
    ];
  }

  const first = execution('a', 'The answer from execution one.');
  const second = execution('b', 'Execution two says something else.');

  /** Alternates the parts of two executions, `lead` parts of `x` first. */
  function interleave(
    x: ModelCallStreamPart[],
    y: ModelCallStreamPart[],
    lead: number,
  ): ModelCallStreamPart[] {
    const parts = x.slice(0, lead);
    for (let index = 0; index < Math.max(x.length - lead, y.length); index++) {
      if (y[index] != null) parts.push(y[index]);
      if (x[index + lead] != null) parts.push(x[index + lead]);
    }
    return parts;
  }

  /** The text parts a chat UI ends up with after reading the stream. */
  async function renderedTexts(parts: ModelCallStreamPart[]) {
    const stream = new ReadableStream<ModelCallStreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    }).pipeThrough(createModelCallToUIChunkTransform());

    let message: UIMessage | undefined;
    for await (const next of readUIMessageStream({ stream })) message = next;

    return (message?.parts ?? []).flatMap(part =>
      part.type === 'text' ? [part.text] : [],
    );
  }

  it('forwards a single execution without its ids', async () => {
    const chunks = await transform([
      ...first,
      { type: 'commit-step', commitAttemptId: 'a' },
    ]);

    expect(chunks.every(chunk => !('attemptId' in chunk))).toBe(true);
    expect(chunks.map(chunk => chunk.type)).not.toContain('commit-step');
    expect(await renderedTexts(first)).toEqual([
      'The answer from execution one.',
    ]);
  });

  it('shows the second execution after the first one stopped part-way', async () => {
    expect(
      await renderedTexts([
        ...first.slice(0, 4),
        ...second,
        { type: 'commit-step', commitAttemptId: 'b' },
      ]),
    ).toEqual(['Execution two says something else.']);
  });

  it('shows the latest announced execution while two write at once', async () => {
    // The first execution keeps writing after the second one started.
    expect(await renderedTexts(interleave(first, second, 3))).toEqual([
      'Execution two says something else.',
    ]);
  });

  it('shows the committed execution when it is not the latest one', async () => {
    expect(
      await renderedTexts([
        ...interleave(first, second, 3),
        { type: 'commit-step', commitAttemptId: 'a' },
      ]),
    ).toEqual(['The answer from execution one.']);
  });

  it('reads the committed execution from any part the workflow writes', async () => {
    expect(
      await renderedTexts([
        ...interleave(first, second, 3),
        {
          type: 'tool-output-denied',
          toolCallId: 'call-1',
          commitAttemptId: 'a',
        } as never,
      ]),
    ).toEqual(['The answer from execution one.']);
  });

  it('ignores a repeated commit of an earlier model call', async () => {
    const commitFirst = { type: 'commit-step', commitAttemptId: 'a' } as const;
    const third = execution('c', 'A third execution.');

    expect(
      await renderedTexts([
        ...first,
        commitFirst,
        { type: 'finish-step' } as never,
        { type: 'start-step' } as never,
        // The next model call runs twice at once, and the step that wrote the
        // commit of the earlier model call runs again in between.
        ...second.slice(0, 3),
        commitFirst,
        ...third.slice(0, 2),
        ...second.slice(3),
        ...third.slice(2),
        { type: 'commit-step', commitAttemptId: 'b' },
      ]),
    ).toEqual([
      'The answer from execution one.',
      'Execution two says something else.',
    ]);
  });

  it('keeps the shown execution when the workflow commits it', async () => {
    const withoutCommit = await transform(interleave(first, second, 3));
    const withCommit = await transform([
      ...interleave(first, second, 3),
      { type: 'commit-step', commitAttemptId: 'b' },
    ]);

    expect(withCommit).toEqual(withoutCommit);
  });

  it('drops parts that a superseded execution writes after the commit', async () => {
    expect(
      await renderedTexts([
        ...first.slice(0, 3),
        ...second,
        { type: 'commit-step', commitAttemptId: 'b' },
        ...first.slice(3),
      ]),
    ).toEqual(['Execution two says something else.']);
  });

  it('forwards parts without an execution id in place', async () => {
    const chunks = await transform([
      ...first.slice(0, 3),
      { type: 'reset-step', attemptId: 'b' },
      { type: 'tool-output-denied', toolCallId: 'call-1' } as never,
      ...first.slice(3),
      ...second.slice(1),
    ]);

    expect(chunks).toContainEqual({
      type: 'tool-output-denied',
      toolCallId: 'call-1',
    });
  });

  it('forwards every execution of a stream that does not identify them', async () => {
    const untagged = (parts: ModelCallStreamPart[]) =>
      parts.map(({ attemptId: _attemptId, ...part }) => part);

    expect(
      await renderedTexts([
        ...untagged(first.slice(0, 4)),
        ...untagged(second),
      ] as ModelCallStreamPart[]),
    ).toEqual(['Execution two says something else.']);
  });

  it('adopts the execution in progress when reading starts part-way', async () => {
    // No reset-step: the reader joined after the execution was announced.
    expect(await renderedTexts(first.slice(1))).toEqual([
      'The answer from execution one.',
    ]);
  });

  it('keeps separate model calls apart', async () => {
    const texts = await renderedTexts([
      ...first,
      { type: 'commit-step', commitAttemptId: 'a' },
      { type: 'finish-step' } as never,
      { type: 'start-step' } as never,
      ...second,
      { type: 'commit-step', commitAttemptId: 'b' },
    ]);

    expect(texts).toEqual([
      'The answer from execution one.',
      'Execution two says something else.',
    ]);
  });

  it('resumes at a UI chunk index when executions overlapped', async () => {
    const parts = [
      ...interleave(first, second, 3),
      { type: 'commit-step', commitAttemptId: 'a' } as const,
    ];
    const canonical = await transform(parts);

    for (let cursor = 0; cursor <= canonical.length; cursor++) {
      expect([
        ...canonical.slice(0, cursor),
        ...(await transform(parts, { uiStartIndex: cursor })),
      ]).toEqual(canonical);
    }
  });
});
