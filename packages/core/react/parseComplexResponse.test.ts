import { parseComplexResponse } from './parseComplexResponse';

describe('parseComplexResponse function', () => {
  it('should parse a single text message from stream', async () => {
    const mockData = '0:"Hello"\n';

    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(Buffer.from(mockData, 'utf-8'));
        controller.close();
      },
    });

    const mockUpdate = jest.fn();

    const result = await parseComplexResponse({
      reader: readableStream.getReader(),
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
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdate.mock.calls[0][0]).toEqual([expectedMessage]);

    // check the prefix map:
    expect(result).toHaveProperty('text');
    expect(result.text).toEqual(expectedMessage);
  });
});
