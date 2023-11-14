import { parseComplexResponse } from './parse-complex-response';

describe('parseComplexResponse function', () => {
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

  function assistantTextMessage(text: string) {
    return {
      id: expect.any(String),
      role: 'assistant',
      content: text,
      createdAt: expect.any(Date),
    };
  }

  it('should parse a single text message', async () => {
    const mockUpdate = jest.fn();

    const result = await parseComplexResponse({
      reader: createTestReader(['0:"Hello"\n']),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
    });

    const expectedMessage = assistantTextMessage('Hello');

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual([expectedMessage]);

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
    expect(mockUpdate).toHaveBeenCalledTimes(4);
    expect(mockUpdate.mock.calls[0][0]).toEqual([
      assistantTextMessage('Hello'),
    ]);
    expect(mockUpdate.mock.calls[1][0]).toEqual([
      assistantTextMessage('Hello,'),
    ]);
    expect(mockUpdate.mock.calls[2][0]).toEqual([
      assistantTextMessage('Hello, world'),
    ]);
    expect(mockUpdate.mock.calls[3][0]).toEqual([
      assistantTextMessage('Hello, world.'),
    ]);

    // check the prefix map:
    expect(result).toHaveProperty('text');
    expect(result.text).toEqual(assistantTextMessage('Hello, world.'));
  });

  it('should parse a function call', async () => {
    const mockUpdate = jest.fn();

    const result = await parseComplexResponse({
      reader: createTestReader([
        '1:"{\\"function_call\\": {\\"name\\": \\"get_current_weather\\", \\"arguments\\": \\"{\\\\n\\\\\\"location\\\\\\": \\\\\\"Charlottesville, Virginia\\\\\\",\\\\n\\\\\\"format\\\\\\": \\\\\\"celsius\\\\\\"\\\\n}\\"}}"\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
    });

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual([
      {
        id: expect.any(String),
        role: 'assistant',
        content: '',
        name: 'get_current_weather',
        function_call: {
          name: 'get_current_weather',
          arguments:
            '{\n"location": "Charlottesville, Virginia",\n"format": "celsius"\n}',
        },
        createdAt: expect.any(Date),
      },
    ]);

    // check the prefix map:
    expect(result.function_call).toEqual({
      id: expect.any(String),
      role: 'assistant',
      content: '',
      name: 'get_current_weather',
      function_call: {
        name: 'get_current_weather',
        arguments:
          '{\n"location": "Charlottesville, Virginia",\n"format": "celsius"\n}',
      },
      createdAt: expect.any(Date),
    });
    expect(result).not.toHaveProperty('text');
    expect(result).not.toHaveProperty('data');
  });

  it('should parse a combination of a data and a text message', async () => {
    const mockUpdate = jest.fn();

    // Execute the parser function
    const result = await parseComplexResponse({
      reader: createTestReader([
        '2:[{"t1":"v1"}]\n',
        '0:"Sample text message."\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
    });

    const expectedData = [{ t1: 'v1' }];

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    expect(mockUpdate.mock.calls[0][0]).toEqual([]);
    expect(mockUpdate.mock.calls[0][1]).toEqual(expectedData);

    expect(mockUpdate.mock.calls[1][0]).toEqual([
      assistantTextMessage('Sample text message.'),
    ]);
    expect(mockUpdate.mock.calls[1][1]).toEqual(expectedData);

    // check the prefix map:
    expect(result).toHaveProperty('data');
    expect(result.data).toEqual(expectedData);

    expect(result).toHaveProperty('text');
    expect(result.text).toEqual(assistantTextMessage('Sample text message.'));
  });
});
