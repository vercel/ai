import { convertArrayToReadableStream } from '../core/test/convert-array-to-readable-stream';
import { convertReadableStreamToArray } from '../core/test/convert-readable-stream-to-array';
import { toAIStream } from './langchain-adapter';

describe('toAIStream', () => {
  it('should convert ReadableStream<LangChainAIMessageChunk>', async () => {
    const inputStream = convertArrayToReadableStream([
      { content: 'Hello' },
      { content: [{ type: 'text', text: 'World' }] },
    ]);

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        toAIStream(inputStream).pipeThrough(new TextDecoderStream()),
      ),
      ['0:"Hello"\n', '0:"World"\n'],
    );
  });

  it('should convert ReadableStream<string> (LangChain StringOutputParser)', async () => {
    const inputStream = convertArrayToReadableStream(['Hello', 'World']);

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        toAIStream(inputStream).pipeThrough(new TextDecoderStream()),
      ),
      ['0:"Hello"\n', '0:"World"\n'],
    );
  });
});
