import type { JSONValue } from '@ai-sdk/provider';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  createCheckpoint,
  validateCheckpoint,
} from '../compact-messages/validate-compaction';
import { createUIMessageCompaction } from './create-ui-message-compaction';
import {
  compactionUIPartSchema,
  deserializeCompactionMessages,
  getUIMessageCompactionDigest,
} from './ui-message-compaction';
import type { UIMessage } from './ui-messages';

const history: UIMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Remember 42.' }],
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'I will remember.', state: 'done' }],
  },
];
const replacement: ModelMessage[] = [
  { role: 'user', content: 'The user asked to remember 42.' },
];

describe('createUIMessageCompaction', () => {
  it('retains a valid summary checkpoint through persistence', async () => {
    const checkpoint = await createCheckpoint(replacement, 0, 1);
    const part = await createUIMessageCompaction({
      messages: history,
      replacementMessages: replacement,
      checkpoint,
    });
    const persisted = JSON.parse(JSON.stringify(part));
    expect(persisted.checkpoint).toEqual(checkpoint);
    expect(compactionUIPartSchema.safeParse(persisted).success).toBe(true);
    await expect(
      validateCheckpoint(
        await deserializeCompactionMessages(persisted.messages),
        persisted.checkpoint,
      ),
    ).resolves.toBeUndefined();
  });

  it('rebinds checkpoints when normalizing binary or legacy file content', async () => {
    const replacementMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [{ type: 'image', image: new Uint8Array([1, 2, 3]) }],
      },
    ];
    const checkpoint = await createCheckpoint(replacementMessages, 0, 1);
    const part = await createUIMessageCompaction({
      messages: history,
      replacementMessages,
      checkpoint,
    });
    expect(part.checkpoint).toMatchObject({
      version: 1,
      startIndex: 0,
      messageCount: 1,
    });
    expect(part.checkpoint?.digest).not.toEqual(checkpoint.digest);
    await expect(
      validateCheckpoint(
        await deserializeCompactionMessages(part.messages),
        part.checkpoint,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects a checkpoint that does not describe the replacement history', async () => {
    const checkpoint = await createCheckpoint(replacement, 0, 1);
    await expect(
      createUIMessageCompaction({
        messages: history,
        replacementMessages: [{ role: 'user', content: 'Changed replacement' }],
        checkpoint,
      }),
    ).rejects.toThrow(
      'checkpoint version, range or message digest does not match',
    );
  });

  it('captures the complete UI prefix and detaches the replacement history', async () => {
    const replacementMessages = structuredClone(replacement);
    const part = await createUIMessageCompaction({
      messages: history,
      replacementMessages,
    });

    expect(part).toEqual({
      type: 'compaction',
      version: 1,
      replaces: {
        messageId: 'assistant-1',
        messageCount: 2,
        partCount: 1,
        digest: await getUIMessageCompactionDigest(history),
      },
      messages: replacement,
    });
    expect(compactionUIPartSchema.safeParse(part).success).toBe(true);
    replacementMessages[0].content = 'Changed';
    expect(part.messages).toEqual(replacement);
  });

  it('round-trips binary data, URLs, references, provider options, and tool files through JSON', async () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image', image: new Uint8Array([1, 2, 3]) },
          {
            type: 'file',
            mediaType: 'text/plain',
            data: new URL('https://example.com/input.txt'),
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: { openai: 'file-123' },
          },
          {
            type: 'file',
            mediaType: 'text/plain',
            data: { type: 'text', text: 'Document text' },
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning-file',
            mediaType: 'image/png',
            data: new Uint8Array([4, 5]).buffer,
          },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read',
            input: { url: 'https://example.com/plain-json' },
          },
        ],
        providerOptions: { test: { signature: 'signature' } },
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'read',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: {
                    type: 'url',
                    url: new URL('https://example.com/output.png'),
                  },
                },
              ],
            },
          },
        ],
      },
    ];
    const part = await createUIMessageCompaction({
      messages: history,
      replacementMessages: messages,
    });
    const persisted = JSON.parse(JSON.stringify(part));
    const restored = await deserializeCompactionMessages(persisted.messages);
    expect(restored).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image',
            data: { type: 'data', data: 'AQID' },
          },
          {
            type: 'file',
            mediaType: 'text/plain',
            data: {
              type: 'url',
              url: new URL('https://example.com/input.txt'),
            },
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: { type: 'reference', reference: { openai: 'file-123' } },
          },
          {
            type: 'file',
            mediaType: 'text/plain',
            data: { type: 'text', text: 'Document text' },
          },
        ],
      },
      {
        ...messages[1],
        content: [
          {
            type: 'reasoning-file',
            mediaType: 'image/png',
            data: { type: 'data', data: 'BAU=' },
          },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read',
            input: { url: 'https://example.com/plain-json' },
          },
        ],
      },
      messages[2],
    ]);
    restored[0].content = 'Changed';
    expect(part.messages).toEqual(persisted.messages);
  });

  it('preserves custom provider context and all remaining file locations', async () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'custom',
            kind: 'test.compaction',
            providerOptions: { test: { encryptedContext: 'opaque' } },
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: { type: 'data', data: new Uint8Array([1, 2]) },
          },
          {
            type: 'reasoning-file',
            mediaType: 'image/png',
            data: {
              type: 'url',
              url: new URL('https://example.com/reasoning.png'),
            },
          },
          {
            type: 'tool-result',
            toolCallId: 'provider-call',
            toolName: 'read',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: new Uint8Array([3, 4]) },
                },
                {
                  type: 'file',
                  mediaType: 'text/plain',
                  data: { type: 'reference', reference: { test: 'file-id' } },
                },
              ],
            },
          },
        ],
      },
    ];
    const part = await createUIMessageCompaction({
      messages: history,
      replacementMessages: modelMessages,
    });
    const restored = await deserializeCompactionMessages(
      JSON.parse(JSON.stringify(part.messages)),
    );
    expect(restored).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'custom',
            kind: 'test.compaction',
            providerOptions: { test: { encryptedContext: 'opaque' } },
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: { type: 'data', data: 'AQI=' },
          },
          {
            type: 'reasoning-file',
            mediaType: 'image/png',
            data: {
              type: 'url',
              url: new URL('https://example.com/reasoning.png'),
            },
          },
          {
            type: 'tool-result',
            toolCallId: 'provider-call',
            toolName: 'read',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: 'AwQ=' },
                },
                {
                  type: 'file',
                  mediaType: 'text/plain',
                  data: { type: 'reference', reference: { test: 'file-id' } },
                },
              ],
            },
          },
        ],
      },
    ]);
  });

  it.each([
    { messages: [] },
    { messages: [{ ...history[0], id: '' }] },
    { messages: [history[0], { ...history[1], id: history[0].id }] },
  ])('rejects empty or ambiguous UI history', async ({ messages }) => {
    await expect(
      createUIMessageCompaction({ messages, replacementMessages: replacement }),
    ).rejects.toThrow('unique message IDs');
  });

  it('allows unfinished parts and faithfully retains pending model tool calls', async () => {
    const pendingMessages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read',
            input: {},
          },
        ],
      },
    ];
    const part = await createUIMessageCompaction({
      messages: [
        ...history,
        {
          id: 'assistant-2',
          role: 'assistant',
          parts: [
            {
              type: 'tool-read',
              toolCallId: 'call-1',
              state: 'input-available',
              input: {},
            },
          ],
        },
      ],
      replacementMessages: pendingMessages,
    });
    expect(await deserializeCompactionMessages(part.messages)).toEqual(
      pendingMessages,
    );
  });

  it('rejects detached tool exchanges in replacement history', async () => {
    await expect(
      createUIMessageCompaction({
        messages: history,
        replacementMessages: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'missing',
                toolName: 'read',
                output: { type: 'text', value: 'Result' },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow('valid model history');
  });

  it.each([NaN, Infinity, BigInt(1), new Date(), () => {}, [undefined]])(
    'rejects tool inputs that would be lost or changed by JSON serialization',
    async input => {
      await expect(
        createUIMessageCompaction({
          messages: history,
          replacementMessages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'read',
                  input,
                  providerExecuted: true,
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(/JSON/);
    },
  );

  it('rejects malformed stored replacement messages', async () => {
    await expect(
      deserializeCompactionMessages([{ role: 'user', content: 42 }]),
    ).rejects.toThrow('valid model history');
    await expect(
      deserializeCompactionMessages([
        { role: 'assistant', content: [{ type: 'tool-result', output: null }] },
      ]),
    ).rejects.toThrow('valid model history');
  });
});

describe('getUIMessageCompactionDigest', () => {
  it('matches static tool history with its unavailable-tool representation', async () => {
    const staticMessage: UIMessage = {
      id: 'tool-message',
      role: 'assistant',
      parts: [
        {
          type: 'tool-search',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { query: 'Question' },
          output: 'Answer',
        },
      ],
    };
    const unavailableMessage: UIMessage = {
      ...staticMessage,
      parts: [
        {
          ...staticMessage.parts[0],
          type: 'dynamic-tool',
          dynamic: false,
          toolName: 'search',
        } as UIMessage['parts'][number],
      ],
    };
    expect(await getUIMessageCompactionDigest([unavailableMessage])).toEqual(
      await getUIMessageCompactionDigest([staticMessage]),
    );
    const trulyDynamicMessage: UIMessage = {
      ...staticMessage,
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'search',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { query: 'Question' },
          output: 'Answer',
        },
      ],
    };
    expect(
      await getUIMessageCompactionDigest([trulyDynamicMessage]),
    ).not.toEqual(await getUIMessageCompactionDigest([staticMessage]));
  });

  it('ignores presentation metadata, key order, and text stream state', async () => {
    const modified: UIMessage[] = [
      {
        parts: [{ text: 'Remember 42.', type: 'text' }],
        role: 'user',
        id: 'user-1',
      },
      {
        ...history[1],
        metadata: { updatedAt: 100 },
        parts: [{ text: 'I will remember.', state: 'streaming', type: 'text' }],
      },
    ];
    expect(await getUIMessageCompactionDigest(modified)).toBe(
      await getUIMessageCompactionDigest(history),
    );
  });

  it('detects changes to message IDs, content, roles, order, and tool outputs', async () => {
    const originalDigest = await getUIMessageCompactionDigest(history);
    for (const modified of [
      [{ ...history[0], id: 'other-id' }, history[1]],
      [{ ...history[0], role: 'system' as const }, history[1]],
      [
        {
          ...history[0],
          parts: [{ type: 'text' as const, text: 'Remember 43.' }],
        },
        history[1],
      ],
      [...history].reverse(),
    ]) {
      expect(await getUIMessageCompactionDigest(modified)).not.toBe(
        originalDigest,
      );
    }
    const toolMessage: UIMessage = {
      id: 'tool-message',
      role: 'assistant',
      parts: [
        {
          type: 'tool-read',
          toolCallId: 'call-1',
          state: 'output-available',
          input: {},
          output: 1,
        },
      ],
    };
    const changed = structuredClone(toolMessage);
    (changed.parts[0] as { output: JSONValue }).output = 2;
    expect(await getUIMessageCompactionDigest([toolMessage])).not.toBe(
      await getUIMessageCompactionDigest([changed]),
    );
  });
});
