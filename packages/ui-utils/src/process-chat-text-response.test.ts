import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { processChatTextResponse } from './process-chat-text-response';
import { Message } from './types';

function createTextStream(chunks: string[]): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream(chunks).pipeThrough(
    new TextEncoderStream(),
  );
}

let updateCalls: Array<{
  message: Message;
  data: any[] | undefined;
  replaceLastMessage: boolean;
}> = [];

let finishCallMessages: Message[] = [];

const update = (options: {
  message: Message;
  data: any[] | undefined;
  replaceLastMessage: boolean;
}) => {
  // clone to preserve the original object
  updateCalls.push(structuredClone(options));
};

const onFinish = (message: Message) => {
  // store the final message
  finishCallMessages.push(structuredClone(message));
};

function mockId(): string {
  // a simple predictable ID generator
  return 'test-id';
}

beforeEach(() => {
  updateCalls = [];
  finishCallMessages = [];
});

describe('processChatTextResponse', () => {
  describe('scenario: simple text response', () => {
    beforeEach(async () => {
      const stream = createTextStream(['Hello, ', 'world!']);

      await processChatTextResponse({
        stream,
        update,
        onFinish,
        generateId: () => mockId(),
        getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      });
    });

    it('should call the update function with correct arguments for each chunk', () => {
      expect(updateCalls).toMatchSnapshot();
    });

    it('should call the onFinish function after the stream ends', () => {
      expect(finishCallMessages).toMatchSnapshot();
    });
  });

  describe('scenario: no text chunks', () => {
    beforeEach(async () => {
      const stream = createTextStream([]);

      await processChatTextResponse({
        stream,
        update,
        onFinish,
        generateId: () => mockId(),
        getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      });
    });

    it('should call the update function with correct arguments for each chunk', () => {
      expect(updateCalls).toMatchSnapshot();
    });

    it('should call the onFinish function after the stream ends', () => {
      expect(finishCallMessages).toMatchSnapshot();
    });
  });

  describe('scenario: multiple short chunks', () => {
    beforeEach(async () => {
      const stream = createTextStream(['A', 'B', 'C', 'D', 'E']);

      await processChatTextResponse({
        stream,
        update,
        onFinish,
        generateId: () => mockId(),
        getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      });
    });

    it('should call the update function with correct arguments for each chunk', () => {
      expect(updateCalls).toMatchSnapshot();
    });

    it('should call the onFinish function after the stream ends', () => {
      expect(finishCallMessages).toMatchSnapshot();
    });
  });
});
