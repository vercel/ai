import type { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { createCheckpoint } from '../compact-messages/validate-compaction';
import { MessageConversionError } from '../prompt/message-conversion-error';
import { convertToModelMessages } from './convert-to-model-messages';
import { createUIMessageCompaction } from './create-ui-message-compaction';
import type { CompactionUIPart, UIMessage } from './ui-messages';

const user = (id: string, text: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});
const assistant = (id: string, text: string): UIMessage => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }],
});
const summary: ModelMessage[] = [{ role: 'user', content: 'Summary context' }];
const recordMessage = (record: CompactionUIPart): UIMessage => ({
  id: 'record',
  role: 'assistant',
  parts: [record],
});

describe('convertToModelMessages compaction', () => {
  it('reports only the selected record and restores its checkpoint', async () => {
    const prefix = [user('u1', 'Question')];
    const checkpoint = await createCheckpoint(summary, 0, 1);
    const earlier = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
      checkpoint,
    });
    const next = [
      ...prefix,
      recordMessage(earlier),
      user('u2', 'Next question'),
    ];
    const latest = await createUIMessageCompaction({
      messages: next,
      replacementMessages: [],
    });
    next[2] = user('u2', 'Edited question');
    const onCompactionApplied = vi.fn(async (_part: CompactionUIPart) => {});

    await convertToModelMessages(
      [...next, { id: 'new-record', role: 'assistant', parts: [latest] }],
      { onCompactionApplied },
    );

    expect(onCompactionApplied).toHaveBeenCalledExactlyOnceWith(earlier);
    expect(onCompactionApplied.mock.calls[0][0].checkpoint).toEqual(checkpoint);
  });

  it('does not report stale or invalid records as applied', async () => {
    const prefix = [user('u1', 'Question')];
    const checkpoint = await createCheckpoint(summary, 0, 1);
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
      checkpoint,
    });
    const onCompactionApplied = vi.fn();
    await convertToModelMessages(
      [user('u1', 'Edited question'), recordMessage(record)],
      { onCompactionApplied },
    );
    expect(onCompactionApplied).not.toHaveBeenCalled();

    record.checkpoint = { ...checkpoint, digest: '0'.repeat(64) };
    await expect(
      convertToModelMessages([...prefix, recordMessage(record)], {
        onCompactionApplied,
      }),
    ).rejects.toBeInstanceOf(MessageConversionError);
    expect(onCompactionApplied).not.toHaveBeenCalled();
  });

  it('awaits onCompactionApplied and propagates callback errors', async () => {
    const prefix = [user('u1', 'Question')];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const error = new Error('Compaction callback failed');
    await expect(
      convertToModelMessages([...prefix, recordMessage(record)], {
        onCompactionApplied: async () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);
  });

  it('replaces only the covered prefix and preserves UI history', async () => {
    const prefix = [user('u1', 'Old question'), assistant('a1', 'Old answer')];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const tail = [user('u2', 'New question'), assistant('a2', 'New answer')];
    const messages = [...prefix, recordMessage(record), ...tail];
    const before = structuredClone(messages);

    expect(await convertToModelMessages(messages)).toEqual([
      ...summary,
      ...(await convertToModelMessages(tail)),
    ]);
    expect(messages).toEqual(before);
  });

  it('preserves parts after a boundary within the same assistant message', async () => {
    const prefix = [user('u1', 'Question'), assistant('a1', 'First step')];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const messages: UIMessage[] = [
      prefix[0],
      {
        ...prefix[1],
        parts: [
          ...prefix[1].parts,
          { type: 'step-start' },
          { type: 'text', text: 'Before record' },
          record,
          { type: 'text', text: 'After record' },
        ],
      },
    ];

    expect(await convertToModelMessages(messages)).toEqual([
      ...summary,
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Before record' },
          { type: 'text', text: 'After record' },
        ],
      },
    ]);
  });

  it('uses the newest applicable record once', async () => {
    const prefix = [user('u1', 'Old question')];
    const first = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const next = [...prefix, recordMessage(first), user('u2', 'Next question')];
    const replacement: ModelMessage[] = [
      { role: 'assistant', content: 'Updated summary' },
    ];
    const second = await createUIMessageCompaction({
      messages: next,
      replacementMessages: replacement,
    });

    expect(
      await convertToModelMessages([
        ...next,
        { id: 'record2', role: 'assistant', parts: [second] },
        user('u3', 'Latest question'),
      ]),
    ).toEqual([
      ...replacement,
      { role: 'user', content: [{ type: 'text', text: 'Latest question' }] },
    ]);
  });

  it('falls back to an earlier valid record when newer covered history changes', async () => {
    const prefix = [user('u1', 'Old question')];
    const first = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const next = [...prefix, recordMessage(first), user('u2', 'Next question')];
    const second = await createUIMessageCompaction({
      messages: next,
      replacementMessages: [],
    });
    next[2] = user('u2', 'Edited question');

    expect(
      await convertToModelMessages([
        ...next,
        { id: 'record2', role: 'assistant', parts: [second] },
      ]),
    ).toEqual([
      ...summary,
      { role: 'user', content: [{ type: 'text', text: 'Edited question' }] },
    ]);
  });

  it.each(['edit', 'remove', 'reorder', 'id', 'no-ids'])(
    'falls back to visible history after %s invalidates the prefix',
    async mutation => {
      const prefix = [
        user('u1', 'Old question'),
        assistant('a1', 'Old answer'),
      ];
      const record = await createUIMessageCompaction({
        messages: prefix,
        replacementMessages: summary,
      });
      let changed: Array<Omit<UIMessage, 'id'> & { id?: string }> =
        structuredClone(prefix);
      if (mutation === 'edit')
        changed[0].parts = [{ type: 'text', text: 'Edited' }];
      if (mutation === 'remove') changed = changed.slice(1);
      if (mutation === 'reorder') changed.reverse();
      if (mutation === 'id') changed[1].id = 'different';
      if (mutation === 'no-ids')
        changed = changed.map(({ id, ...message }) => message);

      expect(
        await convertToModelMessages([...changed, recordMessage(record)]),
      ).toEqual(await convertToModelMessages(changed));
    },
  );

  it('ignores a record whose boundary lies after the record', async () => {
    const prefix = [user('u1', 'Question'), assistant('a1', 'Answer')];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const messages: UIMessage[] = [
      { id: 'a0', role: 'assistant', parts: [record] },
      ...prefix,
    ];
    expect(await convertToModelMessages(messages)).toEqual(
      await convertToModelMessages(prefix),
    );
  });

  it('falls back when edited UI data can no longer be fingerprinted', async () => {
    const prefix: UIMessage[] = [
      user('u1', 'Question'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Answer' },
          { type: 'data-context', data: 'Original data' },
        ],
      },
    ];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    prefix[1].parts[1] = { type: 'data-context', data: new Date() };

    expect(
      await convertToModelMessages([...prefix, recordMessage(record)]),
    ).toEqual(await convertToModelMessages(prefix));
  });

  it('does not convert covered custom data or incomplete tools', async () => {
    const prefix: UIMessage[] = [
      user('u1', 'Question'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'data-context', data: 'Large data' },
          {
            type: 'tool-search',
            toolCallId: 'call',
            state: 'input-available',
            input: {},
          },
        ],
      },
    ];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const convertDataPart = vi.fn();
    expect(
      await convertToModelMessages([...prefix, recordMessage(record)], {
        convertDataPart,
      }),
    ).toEqual(summary);
    expect(convertDataPart).not.toHaveBeenCalled();
  });

  it('preserves complete tool exchanges after the boundary', async () => {
    const prefix = [user('u1', 'Question')];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const tail: UIMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [
        record,
        {
          type: 'tool-search',
          toolCallId: 'call',
          state: 'output-available',
          input: { query: 'New' },
          output: 'Found',
        },
      ],
    };
    const converted = await convertToModelMessages([tail]);
    expect(await convertToModelMessages([...prefix, tail])).toEqual([
      ...summary,
      ...converted,
    ]);
  });

  it('falls back when an existing tool part receives a later output', async () => {
    const prefix: UIMessage[] = [
      user('u1', 'Question'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-search',
            toolCallId: 'call',
            state: 'input-available',
            input: {},
          },
        ],
      },
    ];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    prefix[1].parts = [
      {
        type: 'tool-search',
        toolCallId: 'call',
        state: 'output-available',
        input: {},
        output: 'Found later',
      },
    ];
    expect(
      await convertToModelMessages([...prefix, recordMessage(record)]),
    ).toEqual(await convertToModelMessages(prefix));
  });

  it('supersedes pending approvals retained in replacement context when a user responds', async () => {
    const prefix: UIMessage[] = [
      user('u1', 'Read the file'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read',
            toolCallId: 'call',
            state: 'approval-requested',
            input: {},
            approval: { id: 'approval' },
          },
        ],
      },
    ];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: await convertToModelMessages(prefix),
    });
    const followUp = user('u2', 'Never mind');

    expect(
      await convertToModelMessages([
        ...prefix,
        recordMessage(record),
        followUp,
      ]),
    ).toEqual(await convertToModelMessages([...prefix, followUp]));
  });

  it.each([false, true])(
    'filters incomplete replacement calls when providerExecuted is %s',
    async providerExecuted => {
      const prefix: UIMessage[] = [
        user('u1', 'Read the file'),
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-read',
              toolCallId: 'call',
              state: 'input-available',
              input: {},
              providerExecuted,
            },
          ],
        },
      ];
      const record = await createUIMessageCompaction({
        messages: prefix,
        replacementMessages: await convertToModelMessages(prefix),
      });
      const options = { ignoreIncompleteToolCalls: true };

      expect(
        await convertToModelMessages(
          [...prefix, recordMessage(record)],
          options,
        ),
      ).toEqual(await convertToModelMessages(prefix, options));
    },
  );

  it('filters preliminary outputs retained in replacement context', async () => {
    const prefix: UIMessage[] = [
      user('u1', 'Read the file'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read',
            toolCallId: 'call',
            state: 'output-available',
            input: {},
            output: 'Preliminary',
            preliminary: true,
          },
        ],
      },
    ];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: await convertToModelMessages(prefix),
    });
    const options = { ignoreIncompleteToolCalls: true };

    expect(
      await convertToModelMessages([...prefix, recordMessage(record)], options),
    ).toEqual(await convertToModelMessages(prefix, options));
  });

  it('falls back to an earlier record when the latest retains a superseded approval', async () => {
    const prefix = [user('u1', 'Old question')];
    const earlier = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    const pending: UIMessage = {
      id: 'pending',
      role: 'assistant',
      parts: [
        {
          type: 'tool-read',
          toolCallId: 'call',
          state: 'approval-requested',
          input: {},
          approval: { id: 'approval' },
        },
      ],
    };
    const next = [
      ...prefix,
      recordMessage(earlier),
      user('u2', 'Read the file'),
      pending,
    ];
    const latest = await createUIMessageCompaction({
      messages: next,
      replacementMessages: await convertToModelMessages(next),
    });
    const followUp = user('u3', 'Never mind');

    expect(
      await convertToModelMessages([
        ...next,
        { id: 'latest-record', role: 'assistant', parts: [latest] },
        followUp,
      ]),
    ).toEqual([
      ...summary,
      { role: 'user', content: [{ type: 'text', text: 'Read the file' }] },
      { role: 'user', content: [{ type: 'text', text: 'Never mind' }] },
    ]);
  });

  it('rejects malformed applicable replacement context', async () => {
    const prefix = [user('u1', 'Question')];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    record.messages = [{ role: 'invalid', content: 'Bad context' }];
    await expect(
      convertToModelMessages([...prefix, recordMessage(record)]),
    ).rejects.toBeInstanceOf(MessageConversionError);
  });

  it('rejects records with invalid versions or non-assistant roles', async () => {
    const prefix = [user('u1', 'Question')];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: summary,
    });
    await expect(
      convertToModelMessages([
        ...prefix,
        { ...recordMessage(record), role: 'user' },
      ]),
    ).rejects.toBeInstanceOf(MessageConversionError);
    await expect(
      convertToModelMessages([
        ...prefix,
        recordMessage({ ...record, version: 2 } as unknown as CompactionUIPart),
      ]),
    ).rejects.toBeInstanceOf(MessageConversionError);
  });
});
