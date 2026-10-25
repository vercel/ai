import type { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { cloneModelMessages } from './clone-model-message';

describe('cloneModelMessages', () => {
  it('clones basic messages deeply', () => {
    const original: ModelMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ];

    const cloned = cloneModelMessages(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned[0]).not.toBe(original[0]);
    expect(cloned[0].content).not.toBe(original[0].content);
  });

  it('preserves URL instances while creating independent copies', () => {
    const url = new URL('https://example.com/test.png');
    const original: ModelMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: url,
            mediaType: 'image/png',
          },
        ],
      },
    ];

    const cloned = cloneModelMessages(original);
    const clonedContent = cloned[0].content[0] as {
      type: 'file';
      data: URL;
      mediaType: string;
    };

    expect(clonedContent.data).toBeInstanceOf(URL);
    expect(clonedContent.data.href).toBe('https://example.com/test.png');
    expect(clonedContent.data).not.toBe(url);
  });

  it('clones Uint8Array and ArrayBuffer instances', () => {
    const uint8 = new Uint8Array([1, 2, 3, 4]);
    const original: ModelMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: uint8,
            mediaType: 'application/octet-stream',
          },
        ],
      },
    ];

    const cloned = cloneModelMessages(original);
    const clonedContent = cloned[0].content[0] as {
      type: 'file';
      data: Uint8Array;
      mediaType: string;
    };

    expect(clonedContent.data).toBeInstanceOf(Uint8Array);
    expect([...clonedContent.data]).toEqual([1, 2, 3, 4]);
    expect(clonedContent.data).not.toBe(uint8);
  });

  it('handles circular references in message content without crashing', () => {
    const circularPayload: Record<string, unknown> = {
      name: 'result',
    };
    circularPayload.self = circularPayload;

    const original = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'myTool',
            output: circularPayload,
          },
        ],
      },
    ] as unknown as ModelMessage[];

    const cloned = cloneModelMessages(original);
    const clonedOutput = (cloned[0].content[0] as any).output;

    expect(clonedOutput.name).toBe('result');
    expect(clonedOutput.self).toBe(clonedOutput);
    expect(clonedOutput).not.toBe(circularPayload);
  });

  it('clones Date instances', () => {
    const date = new Date(1700000000000);
    const original = [
      {
        role: 'assistant',
        content: 'message',
        meta: { timestamp: date },
      },
    ] as unknown as ModelMessage[];

    const cloned = cloneModelMessages(original);
    const clonedMeta = (cloned[0] as any).meta;

    expect(clonedMeta.timestamp).toBeInstanceOf(Date);
    expect(clonedMeta.timestamp.getTime()).toBe(1700000000000);
    expect(clonedMeta.timestamp).not.toBe(date);
  });
});
