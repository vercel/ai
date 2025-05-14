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
          "value": {},
        },
        {
          "type": "start-step",
          "value": {},
        },
        {
          "type": "text",
          "value": "Hello",
        },
        {
          "type": "text",
          "value": " ",
        },
        {
          "type": "text",
          "value": "World",
        },
        {
          "type": "finish-step",
          "value": {},
        },
        {
          "type": "finish",
          "value": {},
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
          "value": {},
        },
        {
          "type": "start-step",
          "value": {},
        },
        {
          "type": "finish-step",
          "value": {},
        },
        {
          "type": "finish",
          "value": {},
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
          "value": {},
        },
        {
          "type": "start-step",
          "value": {},
        },
        {
          "type": "text",
          "value": "Complete message",
        },
        {
          "type": "finish-step",
          "value": {},
        },
        {
          "type": "finish",
          "value": {},
        },
      ]
    `);
  });
});
