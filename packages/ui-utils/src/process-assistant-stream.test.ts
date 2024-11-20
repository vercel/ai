import { describe, expect, it, vi } from 'vitest';
import { AssistantStreamPartType } from './assistant-stream-parts';
import { processAssistantStream } from './process-assistant-stream';

function createReadableStream(
  chunks: Uint8Array[],
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    },
  });
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('processAssistantStream', () => {
  // Basic Functionality Tests
  it('should process a simple text stream part', async () => {
    const chunks = [encodeText('0:"Hello"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({
      type: 'text',
      value: 'Hello',
    });
  });

  it('should handle multiple stream parts in sequence', async () => {
    const chunks = [encodeText('0:"Hello"\n3:"error"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
      onErrorPart: value => {
        receivedParts.push({ type: 'error', value });
      },
    });

    expect(receivedParts).toHaveLength(2);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
    expect(receivedParts[1]).toEqual({ type: 'error', value: 'error' });
  });

  it('should handle assistant message parts', async () => {
    const assistantMessage = {
      id: 'msg_123',
      role: 'assistant',
      content: [{ type: 'text', text: { value: 'Hello' } }],
    };
    const chunks = [encodeText(`4:${JSON.stringify(assistantMessage)}\n`)];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onAssistantMessagePart: value => {
        receivedParts.push({ type: 'assistant_message', value });
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({
      type: 'assistant_message',
      value: assistantMessage,
    });
  });

  // Edge Environment Specific Tests
  it('should handle chunks that split JSON values', async () => {
    const chunks = [encodeText('0:"Hel'), encodeText('lo"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
  });

  it('should handle chunks that split at newlines', async () => {
    const chunks = [encodeText('0:"Hello"\n'), encodeText('0:"World"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(2);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
    expect(receivedParts[1]).toEqual({ type: 'text', value: 'World' });
  });

  it('should handle chunks that split unicode characters', async () => {
    const emoji = '👋';
    const encoded = encodeText(`0:"Hello ${emoji}"\n`);
    const splitPoint = encoded.length - 3; // Split in the middle of emoji bytes

    const chunks = [encoded.slice(0, splitPoint), encoded.slice(splitPoint)];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({ type: 'text', value: `Hello ${emoji}` });
  });

  // Error Cases
  it('should throw on malformed JSON', async () => {
    const chunks = [encodeText('0:{malformed]]\n')];
    const stream = createReadableStream(chunks);

    await expect(
      processAssistantStream({
        stream,
        onTextPart: async () => {},
      }),
    ).rejects.toThrow();
  });

  it('should throw on invalid stream part codes', async () => {
    const chunks = [encodeText('x:"invalid"\n')];
    const stream = createReadableStream(chunks);

    await expect(
      processAssistantStream({
        stream,
        onTextPart: async () => {},
      }),
    ).rejects.toThrow('Invalid code');
  });

  // Edge Cases
  it('should handle control data parts', async () => {
    const controlData = {
      threadId: 'thread_123',
      messageId: 'msg_123',
    };
    const chunks = [encodeText(`5:${JSON.stringify(controlData)}\n`)];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onAssistantControlDataPart: value => {
        receivedParts.push({ type: 'assistant_control_data', value });
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({
      type: 'assistant_control_data',
      value: controlData,
    });
  });

  it('should handle data message parts', async () => {
    const dataMessage = {
      role: 'data',
      data: { some: 'data' },
    };
    const chunks = [encodeText(`6:${JSON.stringify(dataMessage)}\n`)];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onDataMessagePart: value => {
        receivedParts.push({ type: 'data_message', value });
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({
      type: 'data_message',
      value: dataMessage,
    });
  });

  it('should handle empty chunks', async () => {
    const chunks = [
      new Uint8Array(0),
      encodeText('0:"Hello"\n'),
      new Uint8Array(0),
      encodeText('0:"World"\n'),
    ];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(2);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
    expect(receivedParts[1]).toEqual({ type: 'text', value: 'World' });
  });

  it('should handle very large messages', async () => {
    const largeString = 'x'.repeat(1024 * 1024); // 1MB string
    const chunks = [encodeText(`0:"${largeString}"\n`)];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({ type: 'text', value: largeString });
  });

  it('should handle multiple newlines', async () => {
    const chunks = [encodeText('0:"Hello"\n\n0:"World"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(2);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
    expect(receivedParts[1]).toEqual({ type: 'text', value: 'World' });
  });

  // Cleanup and Resource Management
  it('should properly release reader resources', async () => {
    const mockRelease = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encodeText('0:"Hello"\n'));
        controller.close();
      },
      cancel: mockRelease,
    });

    await processAssistantStream({
      stream,
      onTextPart: async () => {},
    });

    expect(mockRelease).not.toHaveBeenCalled();
  });

  // Concurrency Tests
  it('should handle rapid stream processing', async () => {
    const parts = Array.from({ length: 100 }, (_, i) => `0:"Message ${i}"\n`);
    const chunks = parts.map(encodeText);
    const stream = createReadableStream(chunks);
    const receivedParts: AssistantStreamPartType[] = [];

    await processAssistantStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(100);
    receivedParts.forEach((part, i) => {
      expect(part).toEqual({ type: 'text', value: `Message ${i}` });
    });
  });
});
