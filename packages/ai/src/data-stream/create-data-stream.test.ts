import { delay } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { DelayedPromise } from '../util/delayed-promise';
import { createDataStream } from './create-data-stream';
import { DataStreamPart } from './data-stream-parts';
import { DataStreamWriter } from './data-stream-writer';

describe('createDataStream', () => {
  it('should send data stream part and close the stream', async () => {
    const stream = createDataStream({
      execute: dataStream => {
        dataStream.write({ type: 'data', value: ['1a'] });
      },
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "data",
          "value": [
            "1a",
          ],
        },
      ]
    `);
  });

  it('should forward a single stream with 2 elements', async () => {
    const stream = createDataStream({
      execute: dataStream => {
        dataStream.merge(
          new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'data', value: ['1a'] });
              controller.enqueue({ type: 'data', value: ['1b'] });
              controller.close();
            },
          }),
        );
      },
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "data",
          "value": [
            "1a",
          ],
        },
        {
          "type": "data",
          "value": [
            "1b",
          ],
        },
      ]
    `);
  });

  it('should send async message annotation and close the stream', async () => {
    const waitPromise = new DelayedPromise<void>();

    const stream = createDataStream({
      execute: async dataStream => {
        await waitPromise.value;
        dataStream.write({ type: 'data', value: ['1a'] });
      },
    });

    waitPromise.resolve(undefined);

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "data",
          "value": [
            "1a",
          ],
        },
      ]
    `);
  });

  it('should forward elements from multiple streams and data parts', async () => {
    let controller1: ReadableStreamDefaultController<DataStreamPart>;
    let controller2: ReadableStreamDefaultController<DataStreamPart>;

    const stream = createDataStream({
      execute: dataStream => {
        dataStream.write({ type: 'data', value: ['data-part-1'] });

        dataStream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );

        controller1!.enqueue({ type: 'data', value: ['1a'] });
        dataStream.write({ type: 'data', value: ['data-part-2'] });
        controller1!.enqueue({ type: 'data', value: ['1b'] });

        dataStream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller2 = controllerArg;
            },
          }),
        );

        dataStream.write({ type: 'data', value: ['data-part-3'] });
      },
    });

    controller2!.enqueue({ type: 'data', value: ['2a'] });
    controller1!.enqueue({ type: 'data', value: ['1c'] });
    controller2!.enqueue({ type: 'data', value: ['2b'] });
    controller2!.close();
    controller1!.enqueue({ type: 'data', value: ['1d'] });
    controller1!.enqueue({ type: 'data', value: ['1e'] });
    controller1!.close();

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "data",
          "value": [
            "data-part-1",
          ],
        },
        {
          "type": "data",
          "value": [
            "data-part-2",
          ],
        },
        {
          "type": "data",
          "value": [
            "data-part-3",
          ],
        },
        {
          "type": "data",
          "value": [
            "1a",
          ],
        },
        {
          "type": "data",
          "value": [
            "2a",
          ],
        },
        {
          "type": "data",
          "value": [
            "1b",
          ],
        },
        {
          "type": "data",
          "value": [
            "2b",
          ],
        },
        {
          "type": "data",
          "value": [
            "1c",
          ],
        },
        {
          "type": "data",
          "value": [
            "1d",
          ],
        },
        {
          "type": "data",
          "value": [
            "1e",
          ],
        },
      ]
    `);
  });

  it('should add error parts when stream errors', async () => {
    let controller1: ReadableStreamDefaultController<DataStreamPart>;
    let controller2: ReadableStreamDefaultController<DataStreamPart>;

    const stream = createDataStream({
      execute: dataStream => {
        dataStream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );
        dataStream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller2 = controllerArg;
            },
          }),
        );
      },
      onError: () => 'error-message',
    });

    controller1!.enqueue({ type: 'data', value: ['1a'] });
    controller1!.error(new Error('1-error'));
    controller2!.enqueue({ type: 'data', value: ['2a'] });
    controller2!.enqueue({ type: 'data', value: ['2b'] });
    controller2!.close();

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { type: 'data', value: ['1a'] },
      { type: 'data', value: ['2a'] },
      { type: 'data', value: ['2b'] },
      { type: 'error', value: 'error-message' },
    ]);
  });

  it('should add error parts when execute throws', async () => {
    const stream = createDataStream({
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
    const stream = createDataStream({
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
    let dataStream: DataStreamWriter;

    const stream = createDataStream({
      execute: dataStreamArg => {
        dataStreamArg.write({ type: 'data', value: ['1a'] });
        dataStream = dataStreamArg;
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { type: 'data', value: ['1a'] },
    ]);

    expect(() =>
      dataStream!.write({ type: 'data', value: ['1b'] }),
    ).not.toThrow();
  });

  it('should support writing from delayed merged streams', async () => {
    let dataStream: DataStreamWriter;
    let controller1: ReadableStreamDefaultController<DataStreamPart>;
    let controller2: ReadableStreamDefaultController<DataStreamPart>;
    let done = false;

    const stream = createDataStream({
      execute: dataStreamArg => {
        dataStreamArg.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );

        dataStream = dataStreamArg;
        done = true;
      },
    });

    const result: DataStreamPart[] = [];
    const reader = stream.getReader();
    async function pull() {
      const { value, done } = await reader.read();
      result.push(value!);
    }

    // function is finished
    expect(done).toBe(true);

    controller1!.enqueue({ type: 'data', value: ['1a'] });
    await pull();

    // controller1 is still open, create 2nd stream
    dataStream!.merge(
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
    controller2!.enqueue({ type: 'data', value: ['2a'] });
    controller2!.close();

    await pull();

    expect(result).toEqual([
      { type: 'data', value: ['1a'] },
      { type: 'data', value: ['2a'] },
    ]);
  });
});
