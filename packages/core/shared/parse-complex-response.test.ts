import { parseComplexResponse } from './parse-complex-response';

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

describe('parseComplexResponse function', () => {
  it('should parse a single text message', async () => {
    const mockUpdate = vi.fn();

    const result = await parseComplexResponse({
      reader: createTestReader(['0:"Hello"\n']),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
      generateId: () => 'test-id',
      getCurrentDate: () => new Date(0),
    });

    const expectedMessage = assistantTextMessage('Hello');

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual([expectedMessage]);

    // check the result
    expect(result).toEqual({
      messages: [
        {
          content: 'Hello',
          createdAt: new Date(0),
          id: 'test-id',
          role: 'assistant',
        },
      ],
      data: [],
    });
  });

  it('should parse a sequence of text messages', async () => {
    const mockUpdate = vi.fn();

    const result = await parseComplexResponse({
      reader: createTestReader([
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
      generateId: () => 'test-id',
      getCurrentDate: () => new Date(0),
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

    // check the result
    expect(result).toEqual({
      messages: [
        {
          content: 'Hello, world.',
          createdAt: new Date(0),
          id: 'test-id',
          role: 'assistant',
        },
      ],
      data: [],
    });
  });

  it('should parse a function call', async () => {
    const mockUpdate = vi.fn();

    const result = await parseComplexResponse({
      reader: createTestReader([
        '1:{"function_call":{"name":"get_current_weather","arguments":"{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
      generateId: () => 'test-id',
      getCurrentDate: () => new Date(0),
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

    // check the result
    expect(result).toEqual({
      messages: [
        {
          content: '',
          createdAt: new Date(0),
          id: 'test-id',
          role: 'assistant',
          function_call: {
            name: 'get_current_weather',
            arguments:
              '{\n"location": "Charlottesville, Virginia",\n"format": "celsius"\n}',
          },
          name: 'get_current_weather',
        },
      ],
      data: [],
    });
  });

  it('should parse a combination of a data and a text message', async () => {
    const mockUpdate = vi.fn();

    // Execute the parser function
    const result = await parseComplexResponse({
      reader: createTestReader([
        '2:[{"t1":"v1"}]\n',
        '0:"Sample text message."\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
      generateId: () => 'test-id',
      getCurrentDate: () => new Date(0),
    });

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    expect(mockUpdate.mock.calls[0][0]).toEqual([]);
    expect(mockUpdate.mock.calls[0][1]).toEqual([{ t1: 'v1' }]);

    expect(mockUpdate.mock.calls[1][0]).toEqual([
      assistantTextMessage('Sample text message.'),
    ]);
    expect(mockUpdate.mock.calls[1][1]).toEqual([{ t1: 'v1' }]);

    // check the result
    expect(result).toEqual({
      messages: [
        {
          content: 'Sample text message.',
          createdAt: new Date(0),
          id: 'test-id',
          role: 'assistant',
        },
      ],
      data: [{ t1: 'v1' }],
    });
  });

  it('should parse multiple data messages incl. primitive values', async () => {
    const mockUpdate = vi.fn();

    // Execute the parser function
    const result = await parseComplexResponse({
      reader: createTestReader([
        '2:[{"t1":"v1"}, 3]\n',
        '2:[null,false,"text"]\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
      generateId: () => 'test-id',
      getCurrentDate: () => new Date(0),
    });

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    expect(mockUpdate.mock.calls[0][0]).toEqual([]);
    expect(mockUpdate.mock.calls[0][1]).toEqual([{ t1: 'v1' }, 3]);

    expect(mockUpdate.mock.calls[1][0]).toEqual([]);
    expect(mockUpdate.mock.calls[1][1]).toEqual([
      { t1: 'v1' },
      3,
      null,
      false,
      'text',
    ]);

    // check the result
    expect(result).toEqual({
      messages: [],
      data: [{ t1: 'v1' }, 3, null, false, 'text'],
    });
  });

  it('should parse a combination of a text message and message annotations', async () => {
    const mockUpdate = vi.fn();

    // Execute the parser function
    const result = await parseComplexResponse({
      reader: createTestReader([
        '8:[{"key":"value"}, 2]\n',
        '0:"Sample text message."\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
      generateId: () => 'test-id',
      getCurrentDate: () => new Date(0),
    });

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    expect(mockUpdate.mock.calls[0][0]).toEqual([]);

    expect(mockUpdate.mock.calls[1][0]).toEqual([
      {
        ...assistantTextMessage('Sample text message.'),
        annotations: [{ key: 'value' }, 2],
      },
    ]);

    // check the result
    expect(result).toEqual({
      messages: [
        {
          ...assistantTextMessage('Sample text message.'),
          annotations: [{ key: 'value' }, 2],
        },
      ],
      data: [],
    });
  });

  it('should parse a combination of a function_call and message annotations', async () => {
    const mockUpdate = vi.fn();

    // Execute the parser function
    const result = await parseComplexResponse({
      reader: createTestReader([
        '1:{"function_call":{"name":"get_current_weather","arguments":"{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}\n',
        '8:[{"key":"value"}, 2]\n',
        '8:[null,false,"text"]\n',
      ]),
      abortControllerRef: { current: new AbortController() },
      update: mockUpdate,
      generateId: () => 'test-id',
      getCurrentDate: () => new Date(0),
    });

    // check the mockUpdate call:
    expect(mockUpdate).toHaveBeenCalledTimes(3);

    expect(mockUpdate.mock.calls[0][0]).toEqual([
      {
        content: '',
        createdAt: new Date(0),
        id: 'test-id',
        role: 'assistant',
        function_call: {
          name: 'get_current_weather',
          arguments:
            '{\n"location": "Charlottesville, Virginia",\n"format": "celsius"\n}',
        },
        name: 'get_current_weather',
      },
    ]);

    expect(mockUpdate.mock.calls[1][0]).toEqual([
      {
        content: '',
        createdAt: new Date(0),
        id: 'test-id',
        role: 'assistant',
        function_call: {
          name: 'get_current_weather',
          arguments:
            '{\n"location": "Charlottesville, Virginia",\n"format": "celsius"\n}',
        },
        name: 'get_current_weather',
        annotations: [{ key: 'value' }, 2],
      },
    ]);

    expect(mockUpdate.mock.calls[2][0]).toEqual([
      {
        content: '',
        createdAt: new Date(0),
        id: 'test-id',
        role: 'assistant',
        function_call: {
          name: 'get_current_weather',
          arguments:
            '{\n"location": "Charlottesville, Virginia",\n"format": "celsius"\n}',
        },
        name: 'get_current_weather',
        annotations: [{ key: 'value' }, 2, null, false, 'text'],
      },
    ]);

    // check the result
    expect(result).toEqual({
      messages: [
        {
          content: '',
          createdAt: new Date(0),
          id: 'test-id',
          role: 'assistant',
          function_call: {
            name: 'get_current_weather',
            arguments:
              '{\n"location": "Charlottesville, Virginia",\n"format": "celsius"\n}',
          },
          name: 'get_current_weather',
          annotations: [{ key: 'value' }, 2, null, false, 'text'],
        },
      ],
      data: [],
    });
  });
});
