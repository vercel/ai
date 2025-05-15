import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { transformTextToUiMessageStream } from './transform-text-to-ui-message-stream';

describe('transformTextToUiMessageStream', () => {
  it('should transform text stream into UI message stream with correct sequence', async () => {
    const transformedStream = transformTextToUiMessageStream({
      stream: convertArrayToReadableStream(['Hello', ' ', 'World']),
    });

    expect(await convertReadableStreamToArray(transformedStream))
      .toMatchInlineSnapshot(`
        [
          {
            "type": "start",
          },
          {
            "type": "start-step",
          },
          {
            "text": "Hello",
            "type": "text",
          },
          {
            "text": " ",
            "type": "text",
          },
          {
            "text": "World",
            "type": "text",
          },
          {
            "type": "finish-step",
          },
          {
            "type": "finish",
          },
        ]
      `);
  });

  it('should handle empty streams correctly', async () => {
    const transformedStream = transformTextToUiMessageStream({
      stream: convertArrayToReadableStream<string>([]),
    });

    expect(await convertReadableStreamToArray(transformedStream))
      .toMatchInlineSnapshot(`
        [
          {
            "type": "start",
          },
          {
            "type": "start-step",
          },
          {
            "type": "finish-step",
          },
          {
            "type": "finish",
          },
        ]
      `);
  });

  it('should handle single chunk streams', async () => {
    const transformedStream = transformTextToUiMessageStream({
      stream: convertArrayToReadableStream(['Complete message']),
    });

    expect(await convertReadableStreamToArray(transformedStream))
      .toMatchInlineSnapshot(`
        [
          {
            "type": "start",
          },
          {
            "type": "start-step",
          },
          {
            "text": "Complete message",
            "type": "text",
          },
          {
            "type": "finish-step",
          },
          {
            "type": "finish",
          },
        ]
      `);
  });
});
