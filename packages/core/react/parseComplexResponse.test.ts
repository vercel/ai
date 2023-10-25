import { parseComplexResponse } from './parseComplexResponse';

describe('parseComplexResponse function', () => {
  if (typeof Response === 'undefined') {
    xit("should skip this test on Node 16 because it doesn't support `Response`", () => {});
    return;
  }

  function createTestReader(chunks: string[]) {
    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(Buffer.from(chunk, 'utf-8'));
        }
        controller.close();
      },
    });
    return readableStream.getReader();
  }

  it('should parse a single text message', async () => {
    const mockUpdate = jest.fn();

    const result = await parseComplexResponse({
      reader: createTestReader(['0:"Hello"\n']),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
    });

    const expectedMessage = {
      id: expect.any(String),
      role: 'assistant',
      content: 'Hello',
      createdAt: expect.any(Date),
    };

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[0][0]).toEqual([expectedMessage]);
    expect(mockUpdate.mock.calls[1][0]).toEqual([expectedMessage]);

    // check the prefix map:
    expect(result).toHaveProperty('text');
    expect(result.text).toEqual(expectedMessage);
  });

  it('should parse a sequence of text messages', async () => {
    const mockUpdate = jest.fn();

    const result = await parseComplexResponse({
      reader: createTestReader([
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
    });

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(8);
    expect(mockUpdate.mock.calls[0][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: 'Hello',
        createdAt: expect.any(Date),
      },
    ]);
    expect(mockUpdate.mock.calls[1][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: 'Hello',
        createdAt: expect.any(Date),
      },
    ]);
    expect(mockUpdate.mock.calls[2][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: 'Hello,',
        createdAt: expect.any(Date),
      },
    ]);
    expect(mockUpdate.mock.calls[3][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: 'Hello,',
        createdAt: expect.any(Date),
      },
    ]);
    expect(mockUpdate.mock.calls[4][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: 'Hello, world',
        createdAt: expect.any(Date),
      },
    ]);
    expect(mockUpdate.mock.calls[5][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: 'Hello, world',
        createdAt: expect.any(Date),
      },
    ]);
    expect(mockUpdate.mock.calls[6][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: 'Hello, world.',
        createdAt: expect.any(Date),
      },
    ]);
    expect(mockUpdate.mock.calls[7][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: 'Hello, world.',
        createdAt: expect.any(Date),
      },
    ]);

    // check the prefix map:
    expect(result).toHaveProperty('text');
    expect(result.text).toEqual({
      id: expect.any(String),
      role: 'assistant',
      content: 'Hello, world.',
      createdAt: expect.any(Date),
    });
  });
});
