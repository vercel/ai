import { describe, it, expect, vi } from 'vitest';
import { processDataStream } from './process-data-stream';
import { StreamPartType } from './stream-parts';

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

describe('processDataStream', () => {
  // Basic Functionality Tests
  it('should process a simple text stream part', async () => {
    const chunks = [encodeText('0:"Hello"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({
      type: 'text',
      value: 'Hello',
    });
  });

  it('should handle multiple stream parts in sequence', async () => {
    const chunks = [encodeText('0:"Hello"\n2:[1,2,3]\n3:"error"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
      },
    });

    expect(receivedParts).toHaveLength(3);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
    expect(receivedParts[1]).toEqual({ type: 'data', value: [1, 2, 3] });
    expect(receivedParts[2]).toEqual({ type: 'error', value: 'error' });
  });

  // Edge Environment Specific Tests
  it('should handle chunks that split JSON values', async () => {
    const chunks = [encodeText('0:"Hel'), encodeText('lo"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
  });

  it('should handle chunks that split at newlines', async () => {
    const chunks = [encodeText('0:"Hello"\n'), encodeText('0:"World"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
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
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
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
      processDataStream({
        stream,
        onStreamPart: async () => {},
      }),
    ).rejects.toThrow();
  });

  it('should throw on invalid stream part codes', async () => {
    const chunks = [encodeText('x:"invalid"\n')];
    const stream = createReadableStream(chunks);

    await expect(
      processDataStream({
        stream,
        onStreamPart: async () => {},
      }),
    ).rejects.toThrow('Invalid code');
  });

  // Edge Cases
  it('should handle empty chunks', async () => {
    const chunks = [
      new Uint8Array(0),
      encodeText('0:"Hello"\n'),
      new Uint8Array(0),
      encodeText('0:"World"\n'),
    ];
    const stream = createReadableStream(chunks);
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
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
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({ type: 'text', value: largeString });
  });

  it('should handle multiple newlines', async () => {
    const chunks = [encodeText('0:"Hello"\n\n0:"World"\n')];
    const stream = createReadableStream(chunks);
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
      },
    });

    expect(receivedParts).toHaveLength(2);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
    expect(receivedParts[1]).toEqual({ type: 'text', value: 'World' });
  });

  // Complex Stream Part Types
  it('should correctly parse assistant message stream parts', async () => {
    const message = {
      id: '123',
      role: 'assistant',
      content: [{ type: 'text', text: { value: 'Hello' } }],
    };
    const chunks = [encodeText(`4:${JSON.stringify(message)}\n`)];
    const stream = createReadableStream(chunks);
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({
      type: 'assistant_message',
      value: message,
    });
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

    await processDataStream({
      stream,
      onStreamPart: async () => {},
    });

    // The reader should be automatically released when the stream is done
    expect(mockRelease).not.toHaveBeenCalled();
  });

  // Concurrency Tests
  it('should handle rapid stream processing', async () => {
    const parts = Array.from({ length: 100 }, (_, i) => `0:"Message ${i}"\n`);
    const chunks = parts.map(encodeText);
    const stream = createReadableStream(chunks);
    const receivedParts: StreamPartType[] = [];

    await processDataStream({
      stream,
      onStreamPart: async part => {
        receivedParts.push(part);
      },
    });

    expect(receivedParts).toHaveLength(100);
    receivedParts.forEach((part, i) => {
      expect(part).toEqual({ type: 'text', value: `Message ${i}` });
    });
  });
});
