import { parseJSON, type ModelMessage } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { compactMessages } from '../compact-messages/compact-messages';
import { streamText } from '../generate-text/stream-text';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { readUIMessageStream } from '../ui-message-stream/read-ui-message-stream';
import { convertToModelMessages } from './convert-to-model-messages';
import { createUIMessageCompaction } from './create-ui-message-compaction';
import { DefaultChatTransport } from './default-chat-transport';
import type { UIMessage } from './ui-messages';
import { validateUIMessages } from './validate-ui-messages';

describe('UI compaction persistence and transport', () => {
  it('streams, persists, reloads, and resends one complete UI conversation', async () => {
    const original: UIMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'Long original conversation' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Original answer' }],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
    ];
    const compacted = await compactMessages({
      messages: await convertToModelMessages(original),
      strategy: async () => ({
        messages: [{ role: 'user', content: 'Compacted context' }],
      }),
    });
    const compaction = await createUIMessageCompaction({
      messages: original,
      replacementMessages: compacted.messages,
    });
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: 'Continued answer' },
          { type: 'text-end', id: 'text' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ]),
      }),
    });
    const requests: UIMessage[][] = [];
    let persisted: UIMessage[] | undefined;
    let nextModelMessages: ModelMessage[] | undefined;

    const transport = new DefaultChatTransport<UIMessage>({
      fetch: async (_url, init) => {
        const body = (await parseJSON({ text: init!.body as string })) as {
          messages: unknown;
        };
        const messages = await validateUIMessages({ messages: body.messages });
        requests.push(messages);
        const modelMessages =
          requests.length === 1
            ? compacted.messages
            : await convertToModelMessages(messages);
        if (requests.length === 2) nextModelMessages = modelMessages;

        return streamText({
          model,
          messages: modelMessages,
        }).toUIMessageStreamResponse({
          originalMessages: messages,
          generateMessageId: () => `response-${requests.length}`,
          compaction: requests.length === 1 ? compaction : undefined,
          onEnd: ({ messages }) => {
            persisted = messages;
          },
        });
      },
    });

    async function send(messages: UIMessage[]) {
      const stream = await transport.sendMessages({
        chatId: 'chat',
        messageId: messages.at(-1)?.id,
        messages,
        trigger: 'submit-message',
        abortSignal: undefined,
      });
      let response: UIMessage | undefined;
      for await (const message of readUIMessageStream({
        stream,
        terminateOnError: true,
      })) {
        response = message;
      }
      return response!;
    }

    const response = await send(original);
    expect(response.parts[0]).toEqual(compaction);
    expect(persisted).toEqual([...original, response]);
    expect(requests[0]).toEqual(original);

    const reloaded = await validateUIMessages({
      messages: await parseJSON({ text: JSON.stringify(persisted) }),
    });
    const followUp: UIMessage = {
      id: 'u3',
      role: 'user',
      parts: [{ type: 'text', text: 'What next?' }],
    };
    await send([...reloaded, followUp]);

    expect(requests[1]).toEqual([...original, response, followUp]);
    expect(nextModelMessages).toEqual([
      ...compacted.messages,
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Continued answer' }],
      },
      { role: 'user', content: [{ type: 'text', text: 'What next?' }] },
    ]);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].prompt).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Compacted context' }] },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Continued answer' }],
      },
      { role: 'user', content: [{ type: 'text', text: 'What next?' }] },
    ]);
  });
});
