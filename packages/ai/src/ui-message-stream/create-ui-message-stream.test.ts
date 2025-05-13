import { delay } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { DelayedPromise } from '../util/delayed-promise';
import { createUIMessageStream } from './create-ui-message-stream';
import { UIMessageStreamPart } from './ui-message-stream-parts';
import { UIMessageStreamWriter } from './ui-message-stream-writer';

describe('createUIMessageStream', () => {
  it('should send data stream part and close the stream', async () => {
    const stream = createUIMessageStream({
      execute: stream => {
        stream.write({ type: 'text', value: '1a' });
      },
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "1a",
        },
      ]
    `);
  });

  it('should forward a single stream with 2 elements', async () => {
    const stream = createUIMessageStream({
      execute: stream => {
        stream.merge(
          new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text', value: '1a' });
              controller.enqueue({ type: 'text', value: '1b' });
              controller.close();
            },
          }),
        );
      },
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "1a",
        },
        {
          "type": "text",
          "value": "1b",
        },
      ]
    `);
  });

  it('should send async message annotation and close the stream', async () => {
    const waitPromise = new DelayedPromise<void>();

    const stream = createUIMessageStream({
      execute: async stream => {
        await waitPromise.value;
        stream.write({ type: 'text', value: '1a' });
      },
    });

    waitPromise.resolve(undefined);

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "1a",
        },
      ]
    `);
  });

  it('should forward elements from multiple streams and data parts', async () => {
    let controller1: ReadableStreamDefaultController<UIMessageStreamPart>;
    let controller2: ReadableStreamDefaultController<UIMessageStreamPart>;

    const stream = createUIMessageStream({
      execute: stream => {
        stream.write({ type: 'text', value: 'data-part-1' });

        stream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );

        controller1!.enqueue({ type: 'text', value: '1a' });
        stream.write({ type: 'text', value: 'data-part-2' });
        controller1!.enqueue({ type: 'text', value: '1b' });

        stream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller2 = controllerArg;
            },
          }),
        );

        stream.write({ type: 'text', value: 'data-part-3' });
      },
    });

    controller2!.enqueue({ type: 'text', value: '2a' });
    controller1!.enqueue({ type: 'text', value: '1c' });
    controller2!.enqueue({ type: 'text', value: '2b' });
    controller2!.close();
    controller1!.enqueue({ type: 'text', value: '1d' });
    controller1!.enqueue({ type: 'text', value: '1e' });
    controller1!.close();

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "data-part-1",
        },
        {
          "type": "text",
          "value": "data-part-2",
        },
        {
          "type": "text",
          "value": "data-part-3",
        },
        {
          "type": "text",
          "value": "1a",
        },
        {
          "type": "text",
          "value": "2a",
        },
        {
          "type": "text",
          "value": "1b",
        },
        {
          "type": "text",
          "value": "2b",
        },
        {
          "type": "text",
          "value": "1c",
        },
        {
          "type": "text",
          "value": "1d",
        },
        {
          "type": "text",
          "value": "1e",
        },
      ]
    `);
  });

  it('should add error parts when stream errors', async () => {
    let controller1: ReadableStreamDefaultController<UIMessageStreamPart>;
    let controller2: ReadableStreamDefaultController<UIMessageStreamPart>;

    const stream = createUIMessageStream({
      execute: stream => {
        stream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );
        stream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller2 = controllerArg;
            },
          }),
        );
      },
      onError: () => 'error-message',
    });

    controller1!.enqueue({ type: 'text', value: '1a' });
    controller1!.error(new Error('1-error'));
    controller2!.enqueue({ type: 'text', value: '2a' });
    controller2!.enqueue({ type: 'text', value: '2b' });
    controller2!.close();

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { type: 'text', value: '1a' },
      { type: 'text', value: '2a' },
      { type: 'text', value: '2b' },
      { type: 'error', value: 'error-message' },
    ]);
  });

  it('should add error parts when execute throws', async () => {
    const stream = createUIMessageStream({
      execute: () => {
        throw new Error('execute-error');
      },
      onError: () => 'error-message',
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { type: 'error', value: 'error-message' },
    ]);
  });

  it('should add error parts when execute throws with promise', async () => {
    const stream = createUIMessageStream({
      execute: async () => {
        throw new Error('execute-error');
      },
      onError: () => 'error-message',
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { type: 'error', value: 'error-message' },
    ]);
  });

  it('should suppress error when writing to closed stream', async () => {
    let uiMessageStream: UIMessageStreamWriter;

    const stream = createUIMessageStream({
      execute: uiMessageStreamArg => {
        uiMessageStreamArg.write({ type: 'text', value: '1a' });
        uiMessageStream = uiMessageStreamArg;
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { type: 'text', value: '1a' },
    ]);

    expect(() =>
      uiMessageStream!.write({ type: 'text', value: '1b' }),
    ).not.toThrow();
  });

  it('should support writing from delayed merged streams', async () => {
    let uiMessageStream: UIMessageStreamWriter;
    let controller1: ReadableStreamDefaultController<UIMessageStreamPart>;
    let controller2: ReadableStreamDefaultController<UIMessageStreamPart>;
    let done = false;

    const stream = createUIMessageStream({
      execute: uiMessageStreamArg => {
        uiMessageStreamArg.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );

        uiMessageStream = uiMessageStreamArg;
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

    controller1!.enqueue({ type: 'text', value: '1a' });
    await pull();

    // controller1 is still open, create 2nd stream
    uiMessageStream!.merge(
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
    controller2!.enqueue({ type: 'text', value: '2a' });
    controller2!.close();

    await pull();

    expect(result).toEqual([
      { type: 'text', value: '1a' },
      { type: 'text', value: '2a' },
    ]);
  });
});
