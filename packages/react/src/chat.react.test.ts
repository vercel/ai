import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { Chat } from './chat.react';

function createStream(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('Chat', () => {
  it('publishes new part identities without cloning nested payloads', async () => {
    const output = { payload: 'large tool output' };
    const structuredCloneSpy = vi.spyOn(globalThis, 'structuredClone');
    const assistantSnapshots: UIMessage[] = [];

    const transport: ChatTransport<UIMessage> = {
      async sendMessages() {
        return createStream([
          { type: 'start', messageId: 'assistant-message' },
          { type: 'start-step' },
          {
            type: 'tool-input-available',
            toolCallId: 'tool-call-1',
            toolName: 'test-tool',
            input: {},
          },
          {
            type: 'tool-output-available',
            toolCallId: 'tool-call-1',
            output,
          },
          {
            type: 'tool-input-available',
            toolCallId: 'tool-call-2',
            toolName: 'test-tool',
            input: {},
          },
          { type: 'finish-step' },
          { type: 'finish' },
        ]);
      },
      async reconnectToStream() {
        return null;
      },
    };

    const chat = new Chat({
      id: 'chat-id',
      generateId: () => 'generated-id',
      transport,
    });

    chat['~registerMessagesCallback'](() => {
      const message = chat.messages.at(-1);
      const outputPart = message?.parts.find(
        part => 'output' in part && part.output === output,
      );

      if (message?.role === 'assistant' && outputPart != null) {
        assistantSnapshots.push(message);
      }
    });

    await chat.sendMessage({ text: 'Run tools.' });

    expect(structuredCloneSpy).not.toHaveBeenCalled();
    expect(assistantSnapshots.length).toBeGreaterThan(1);

    const [firstSnapshot, secondSnapshot] = assistantSnapshots;
    const firstPart = firstSnapshot.parts.find(part => 'output' in part)!;
    const secondPart = secondSnapshot.parts.find(part => 'output' in part)!;

    expect(secondSnapshot).not.toBe(firstSnapshot);
    expect(secondSnapshot.parts).not.toBe(firstSnapshot.parts);
    expect(secondPart).not.toBe(firstPart);
    expect('output' in firstPart && firstPart.output).toBe(output);
    expect('output' in secondPart && secondPart.output).toBe(output);
    structuredCloneSpy.mockRestore();
  });
});
