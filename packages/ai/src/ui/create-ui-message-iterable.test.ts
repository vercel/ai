import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { UIMessageStreamPart } from '../../src/ui-message-stream/ui-message-stream-parts';
import { createUiMessageIterable } from './create-ui-message-iterable';

function createUIMessageStream(parts: UIMessageStreamPart[]) {
  return convertArrayToReadableStream(parts);
}

describe('createUiMessageGenerator', () => {
  it('should return a ui message object stream for a basic input stream', async () => {
    const stream = createUIMessageStream([
      { type: 'start', messageId: 'msg-123' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello, ' },
      { type: 'text-delta', id: 'text-1', delta: 'world!' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    const iterable = createUiMessageIterable({ stream });

    expect(await convertAsyncIterableToArray(iterable)).toMatchInlineSnapshot(`
      [
        {
          "id": "msg-123",
          "metadata": undefined,
          "parts": [],
          "role": "assistant",
        },
        {
          "id": "msg-123",
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "state": "streaming",
              "text": "",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
        {
          "id": "msg-123",
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "state": "streaming",
              "text": "Hello, ",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
        {
          "id": "msg-123",
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "state": "streaming",
              "text": "Hello, world!",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
        {
          "id": "msg-123",
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "state": "done",
              "text": "Hello, world!",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });
});
