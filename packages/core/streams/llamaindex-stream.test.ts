import { LlamaIndexStream } from './llamaindex-stream';

describe('LlamaIndexStream function', () => {
  it('should create a ReadableStream', async () => {
    const mockGenerator = jest.fn(async function* () {
      yield '   Hello'; // Note the leading whitespace, which should be trimmed by LlamaIndexStream
      yield 'World';
    })();

    const stream = LlamaIndexStream(mockGenerator);

    const reader = stream.getReader();

    const decoder = new TextDecoder();

    const result1 = await reader.read();
    expect(decoder.decode(result1.value)).toEqual('Hello');

    const result2 = await reader.read();
    expect(decoder.decode(result2.value)).toEqual('World');

    const result3 = await reader.read();
    expect(result3.done).toEqual(true);
  });
});
