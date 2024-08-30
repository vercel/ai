import { describe, expect, it, vi } from 'vitest';
import { processDataProtocolResponse } from './process-data-protocol-response';
import { formatStreamPart } from './stream-parts';
import { createDataProtocolStream } from './test/create-data-protocol-stream';
import { JSONValue, Message } from './types';
import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

describe('processDataProtocolResponse', () => {
  let updateCalls: Array<{
    merged: Message[];
    data: JSONValue[] | undefined;
  }> = [];
  const update = (merged: Message[], data: JSONValue[] | undefined) => {
    updateCalls.push({ merged, data });
  };

  let finishCalls: Array<{
    prefixMap: any;
    finishReason: LanguageModelV1FinishReason;
    usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    };
  }> = [];
  const onFinish = (options: {
    prefixMap: any;
    finishReason: LanguageModelV1FinishReason;
    usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    };
  }) => {
    finishCalls.push(options);
  };

  beforeEach(() => {
    updateCalls = [];
    finishCalls = [];
  });

  describe('scenario: simple text response', () => {
    let result: Awaited<ReturnType<typeof processDataProtocolResponse>>;

    beforeEach(async () => {
      const stream = createDataProtocolStream([
        formatStreamPart('text', 'Hello, '),
        formatStreamPart('text', 'world!'),
        formatStreamPart('finish_message', {
          finishReason: 'stop',
          usage: { completionTokens: 5, promptTokens: 10 },
        }),
      ]);

      result = await processDataProtocolResponse({
        reader: stream.getReader(),
        update,
        onFinish,
        generateId: vi.fn().mockReturnValue('mock-id'),
        getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      });
    });

    it('should return the correct messages', async () => {
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        id: 'mock-id',
        role: 'assistant',
        content: 'Hello, world!',
        createdAt: new Date('2023-01-01'),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toHaveLength(3);
      expect(updateCalls[0]).toEqual({
        merged: [
          {
            content: 'Hello, ',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'mock-id',
            role: 'assistant',
          },
        ],
        data: [],
      });
      expect(updateCalls[1]).toEqual({
        merged: [
          {
            content: 'Hello, world!',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'mock-id',
            role: 'assistant',
          },
        ],
        data: [],
      });
      expect(updateCalls[2]).toEqual({
        merged: [
          {
            content: 'Hello, world!',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'mock-id',
            role: 'assistant',
          },
        ],
        data: [],
      });
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toHaveLength(1);
      expect(finishCalls[0]).toEqual({
        prefixMap: {
          data: [],
          text: {
            content: 'Hello, world!',
            createdAt: new Date('2023-01-01'),
            id: 'mock-id',
            role: 'assistant',
          },
        },
        finishReason: 'stop',
        usage: {
          completionTokens: 5,
          promptTokens: 10,
          totalTokens: 15,
        },
      });
    });
  });
});
