import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from 'ai/test';
import { toUIMessageStream } from './langchain-adapter';

describe('toUIMessageStream', () => {
  it('should convert ReadableStream<LangChainAIMessageChunk>', async () => {
    const inputStream = convertArrayToReadableStream([
      { content: 'Hello' },
      { content: [{ type: 'text', text: 'World' }] },
    ]);

    expect(await convertReadableStreamToArray(toUIMessageStream(inputStream)))
      .toMatchInlineSnapshot(`
        [
          {
            "type": "text",
            "value": "Hello",
          },
          {
            "type": "text",
            "value": "World",
          },
        ]
      `);
  });

  it('should convert ReadableStream<string> (LangChain StringOutputParser)', async () => {
    const inputStream = convertArrayToReadableStream(['Hello', 'World']);

    expect(await convertReadableStreamToArray(toUIMessageStream(inputStream)))
      .toMatchInlineSnapshot(`
        [
          {
            "type": "text",
            "value": "Hello",
          },
          {
            "type": "text",
            "value": "World",
          },
        ]
      `);
  });

  it('should convert ReadableStream<LangChainStreamEvent>', async () => {
    const inputStream = convertArrayToReadableStream([
      { event: 'on_chat_model_stream', data: { chunk: { content: 'Hello' } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: 'World' } } },
    ]);

    expect(await convertReadableStreamToArray(toUIMessageStream(inputStream)))
      .toMatchInlineSnapshot(`
        [
          {
            "type": "text",
            "value": "Hello",
          },
          {
            "type": "text",
            "value": "World",
          },
        ]
      `);
  });
});
