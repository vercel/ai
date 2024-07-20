import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
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

  it('should convert ReadableStream<LangChainStreamEvent>', async () => {
    const inputStream = convertArrayToReadableStream([
      { event: 'on_chat_model_stream', data: { chunk: { content: 'Hello' } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: 'World' } } },
    ]);

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        toAIStream(inputStream).pipeThrough(new TextDecoderStream()),
      ),
      ['0:"Hello"\n', '0:"World"\n'],
    );
  });
});
