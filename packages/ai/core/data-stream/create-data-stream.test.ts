import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { expect, it } from 'vitest';
import { delay } from '../../util/delay';
import { DelayedPromise } from '../../util/delayed-promise';
import { createDataStream } from './create-data-stream';
import { DataStreamWriter } from './data-stream-writer';

describe('createDataStream', () => {
  it('should send single data json and close the stream', async () => {
    const stream = createDataStream({
      execute: dataStream => {
        dataStream.writeData('1a');
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('data', ['1a']),
    ]);
  });

  it('should send message annotation and close the stream', async () => {
    const stream = createDataStream({
      execute: dataStream => {
        dataStream.writeMessageAnnotation({
          type: 'message-annotation',
          value: '1a',
        });
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('message_annotations', [
        { type: 'message-annotation', value: '1a' },
      ]),
    ]);
  });

  it('should forward a single stream with 2 elements', async () => {
    const stream = createDataStream({
      execute: dataStream => {
        dataStream.merge(
          new ReadableStream({
            start(controller) {
              controller.enqueue(formatDataStreamPart('data', ['1a']));
              controller.enqueue(formatDataStreamPart('data', ['1b']));
              controller.close();
            },
          }),
        );
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('data', ['1a']),
      formatDataStreamPart('data', ['1b']),
    ]);
  });

  it('should send async message annotation and close the stream', async () => {
    const waitPromise = new DelayedPromise<void>();

    const stream = createDataStream({
      execute: async dataStream => {
        await waitPromise.value;
        dataStream.writeData('1a');
      },
    });

    waitPromise.resolve(undefined);

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('data', ['1a']),
    ]);
  });

  it('should forward elements from multiple streams and data parts', async () => {
    let controller1: ReadableStreamDefaultController<string>;
    let controller2: ReadableStreamDefaultController<string>;

    const stream = createDataStream({
      execute: dataStream => {
        dataStream.writeData('data-part-1');

        dataStream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );

        controller1!.enqueue('1a');
        dataStream.writeData('data-part-2');
        controller1!.enqueue('1b');

        dataStream.merge(
          new ReadableStream({
            start(controllerArg) {
              controller2 = controllerArg;
            },
          }),
        );

        dataStream.writeData('data-part-3');
      },
    });

    controller2!.enqueue('2a');
    controller1!.enqueue('1c');
    controller2!.enqueue('2b');
    controller2!.close();
    controller1!.enqueue('1d');
    controller1!.enqueue('1e');
    controller1!.close();

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('data', ['data-part-1']),
      formatDataStreamPart('data', ['data-part-2']),
      formatDataStreamPart('data', ['data-part-3']),
      '1a',
      '2a',
      '1b',
      '2b',
      '1c',
      '1d',
      '1e',
    ]);
  });

  it('should add error parts when stream errors', async () => {
    let controller1: ReadableStreamDefaultController<string>;
    let controller2: ReadableStreamDefaultController<string>;

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

    controller1!.enqueue('1a');
    controller1!.error(new Error('1-error'));
    controller2!.enqueue('2a');
    controller2!.enqueue('2b');
    controller2!.close();

    expect(await convertReadableStreamToArray(stream)).toEqual([
      '1a',
      '2a',
      '2b',
      formatDataStreamPart('error', 'error-message'),
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
      formatDataStreamPart('error', 'error-message'),
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
      formatDataStreamPart('error', 'error-message'),
    ]);
  });

  it('should suppress error when writing to closed stream', async () => {
    let dataStream: DataStreamWriter;

    const stream = createDataStream({
      execute: dataStreamArg => {
        dataStreamArg.writeData('1a');
        dataStream = dataStreamArg;
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('data', ['1a']),
    ]);

    expect(() => dataStream!.writeData('1b')).not.toThrow();
  });

  it('should support writing from delayed merged streams', async () => {
    let dataStream: DataStreamWriter;
    let controller1: ReadableStreamDefaultController<string>;
    let controller2: ReadableStreamDefaultController<string>;
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

    const result: string[] = [];
    const reader = stream.getReader();
    async function pull() {
      const { value, done } = await reader.read();
      result.push(value!);
    }

    // function is finished
    expect(done).toBe(true);

    controller1!.enqueue('1a');
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
    controller2!.enqueue('2a');
    controller2!.close();

    await pull();

    expect(result).toEqual(['1a', '2a']);
  });
});
