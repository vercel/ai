import { delay } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { DelayedPromise } from '../util/delayed-promise';
import { createUIMessageStream } from './create-ui-message-stream';
import { UIMessageStreamPart } from './ui-message-stream-parts';
import { UIMessageStreamWriter } from './ui-message-stream-writer';
import { consumeStream } from '../util/consume-stream';
import { UIDataTypes, UIMessage } from '../ui';

describe('createUIMessageStream', () => {
  it('should send data stream part and close the stream', async () => {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text', text: '1a' });
      },
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "text": "1a",
          "type": "text",
        },
      ]
    `);
  });

  it('should forward a single stream with 2 elements', async () => {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.merge(
          new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text', text: '1a' });
              controller.enqueue({ type: 'text', text: '1b' });
              controller.close();
            },
          }),
        );
      },
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "text": "1a",
          "type": "text",
        },
        {
          "text": "1b",
          "type": "text",
        },
      ]
    `);
  });

  it('should send async message annotation and close the stream', async () => {
    const wait = new DelayedPromise<void>();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        await wait.promise;
        writer.write({ type: 'text', text: '1a' });
      },
    });

    wait.resolve(undefined);

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "text": "1a",
          "type": "text",
        },
      ]
    `);
  });

  it('should forward elements from multiple streams and data parts', async () => {
    let controller1: ReadableStreamDefaultController<UIMessageStreamPart>;
    let controller2: ReadableStreamDefaultController<UIMessageStreamPart>;

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text', text: 'data-part-1' });

        writer.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );

        controller1!.enqueue({ type: 'text', text: '1a' });
        writer.write({ type: 'text', text: 'data-part-2' });
        controller1!.enqueue({ type: 'text', text: '1b' });

        writer.merge(
          new ReadableStream({
            start(controllerArg) {
              controller2 = controllerArg;
            },
          }),
        );

        writer.write({ type: 'text', text: 'data-part-3' });
      },
    });

    controller2!.enqueue({ type: 'text', text: '2a' });
    controller1!.enqueue({ type: 'text', text: '1c' });
    controller2!.enqueue({ type: 'text', text: '2b' });
    controller2!.close();
    controller1!.enqueue({ type: 'text', text: '1d' });
    controller1!.enqueue({ type: 'text', text: '1e' });
    controller1!.close();

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "text": "data-part-1",
          "type": "text",
        },
        {
          "text": "data-part-2",
          "type": "text",
        },
        {
          "text": "data-part-3",
          "type": "text",
        },
        {
          "text": "1a",
          "type": "text",
        },
        {
          "text": "2a",
          "type": "text",
        },
        {
          "text": "1b",
          "type": "text",
        },
        {
          "text": "2b",
          "type": "text",
        },
        {
          "text": "1c",
          "type": "text",
        },
        {
          "text": "1d",
          "type": "text",
        },
        {
          "text": "1e",
          "type": "text",
        },
      ]
    `);
  });

  it('should add error parts when stream errors', async () => {
    let controller1: ReadableStreamDefaultController<UIMessageStreamPart>;
    let controller2: ReadableStreamDefaultController<UIMessageStreamPart>;

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );
        writer.merge(
          new ReadableStream({
            start(controllerArg) {
              controller2 = controllerArg;
            },
          }),
        );
      },
      onError: () => 'error-message',
    });

    controller1!.enqueue({ type: 'text', text: '1a' });
    controller1!.error(new Error('1-error'));
    controller2!.enqueue({ type: 'text', text: '2a' });
    controller2!.enqueue({ type: 'text', text: '2b' });
    controller2!.close();

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "text": "1a",
          "type": "text",
        },
        {
          "text": "2a",
          "type": "text",
        },
        {
          "text": "2b",
          "type": "text",
        },
        {
          "errorText": "error-message",
          "type": "error",
        },
      ]
    `);
  });

  it('should add error parts when execute throws', async () => {
    const stream = createUIMessageStream({
      execute: () => {
        throw new Error('execute-error');
      },
      onError: () => 'error-message',
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "errorText": "error-message",
          "type": "error",
        },
      ]
    `);
  });

  it('should add error parts when execute throws with promise', async () => {
    const stream = createUIMessageStream({
      execute: async () => {
        throw new Error('execute-error');
      },
      onError: () => 'error-message',
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "errorText": "error-message",
          "type": "error",
        },
      ]
    `);
  });

  it('should suppress error when writing to closed stream', async () => {
    let uiMessageStreamWriter: UIMessageStreamWriter<UIMessage>;

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text', text: '1a' });
        uiMessageStreamWriter = writer;
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { type: 'text', text: '1a' },
    ]);

    expect(() =>
      uiMessageStreamWriter!.write({ type: 'text', text: '1b' }),
    ).not.toThrow();
  });

  it('should support writing from delayed merged streams', async () => {
    let uiMessageStreamWriter: UIMessageStreamWriter<UIMessage>;
    let controller1: ReadableStreamDefaultController<UIMessageStreamPart>;
    let controller2: ReadableStreamDefaultController<UIMessageStreamPart>;
    let done = false;

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );

        uiMessageStreamWriter = writer;
        done = true;
      },
    });

    const result: UIMessageStreamPart[] = [];
    const reader = stream.getReader();
    async function pull() {
      const { value, done } = await reader.read();
      result.push(value!);
    }

    // function is finished
    expect(done).toBe(true);

    controller1!.enqueue({ type: 'text', text: '1a' });
    await pull();

    // controller1 is still open, create 2nd stream
    uiMessageStreamWriter!.merge(
      new ReadableStream({
        start(controllerArg) {
          controller2 = controllerArg;
        },
      }),
    );

    // close controller1
    controller1!.close();

    await delay(); // relinquish control

    // it should still be able to write to controller2
    controller2!.enqueue({ type: 'text', text: '2a' });
    controller2!.close();

    await pull();

    expect(result).toEqual([
      { type: 'text', text: '1a' },
      { type: 'text', text: '2a' },
    ]);
  });

  it('should handle onFinish without original messages', async () => {
    const recordedOptions: any[] = [];

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text', text: '1a' });
      },
      onFinish: options => {
        recordedOptions.push(options);
      },
      generateId: () => 'response-message-id',
    });

    await consumeStream({ stream });

    expect(recordedOptions).toMatchInlineSnapshot(`
      [
        {
          "isContinuation": false,
          "messages": [
            {
              "id": "response-message-id",
              "metadata": undefined,
              "parts": [
                {
                  "text": "1a",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          "responseMessage": {
            "id": "response-message-id",
            "metadata": undefined,
            "parts": [
              {
                "text": "1a",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        },
      ]
    `);
  });

  it('should handle onFinish with messages', async () => {
    const recordedOptions: any[] = [];

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text', text: '1b' });
      },
      originalMessages: [
        {
          id: '0',
          role: 'user',
          parts: [{ type: 'text', text: '0a' }],
        },
        {
          id: '1',
          role: 'assistant',
          parts: [{ type: 'text', text: '1a' }],
        },
      ],
      onFinish: options => {
        recordedOptions.push(options);
      },
    });

    await consumeStream({ stream });

    expect(recordedOptions).toMatchInlineSnapshot(`
      [
        {
          "isContinuation": true,
          "messages": [
            {
              "id": "0",
              "parts": [
                {
                  "text": "0a",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "1",
              "parts": [
                {
                  "text": "1a",
                  "type": "text",
                },
                {
                  "text": "1b",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          "responseMessage": {
            "id": "1",
            "parts": [
              {
                "text": "1a",
                "type": "text",
              },
              {
                "text": "1b",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        },
      ]
    `);
  });

  it('should inject a messageId into the stream when originalMessages are provided', async () => {
    const recordedOptions: any[] = [];

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'start' }); // no messageId
      },
      originalMessages: [
        { id: '0', role: 'user', parts: [{ type: 'text', text: '0a' }] },
        // no assistant message
      ],
      onFinish(options) {
        recordedOptions.push(options);
      },
      generateId: () => 'response-message-id',
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "messageId": "response-message-id",
          "type": "start",
        },
      ]
    `);
    expect(recordedOptions).toMatchInlineSnapshot(`
      [
        {
          "isContinuation": false,
          "messages": [
            {
              "id": "0",
              "parts": [
                {
                  "text": "0a",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "response-message-id",
              "metadata": undefined,
              "parts": [],
              "role": "assistant",
            },
          ],
          "responseMessage": {
            "id": "response-message-id",
            "metadata": undefined,
            "parts": [],
            "role": "assistant",
          },
        },
      ]
    `);
  });

  it('should keep existing messageId from start chunk when originalMessages are provided', async () => {
    const recordedOptions: any[] = [];

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'start', messageId: 'existing-message-id' });
      },
      originalMessages: [
        { id: '0', role: 'user', parts: [{ type: 'text', text: '0a' }] },
        // no assistant message
      ],
      onFinish(options) {
        recordedOptions.push(options);
      },
      generateId: () => 'response-message-id',
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "messageId": "existing-message-id",
          "type": "start",
        },
      ]
    `);
    expect(recordedOptions).toMatchInlineSnapshot(`
      [
        {
          "isContinuation": false,
          "messages": [
            {
              "id": "0",
              "parts": [
                {
                  "text": "0a",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "existing-message-id",
              "metadata": undefined,
              "parts": [],
              "role": "assistant",
            },
          ],
          "responseMessage": {
            "id": "existing-message-id",
            "metadata": undefined,
            "parts": [],
            "role": "assistant",
          },
        },
      ]
    `);
  });
});
