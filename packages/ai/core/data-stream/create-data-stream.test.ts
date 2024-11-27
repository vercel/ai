import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { expect, it } from 'vitest';
import { createDataStream } from './create-data-stream';

describe('createDataStream', () => {
  it('should send single data json and close the stream', async () => {
    const stream = createDataStream({
      execute: dataStream => {
        dataStream.appendData('1a');
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('data', ['1a']),
    ]);
  });

  it('should send message annotation and close the stream', async () => {
    const stream = createDataStream({
      execute: dataStream => {
        dataStream.appendMessageAnnotation({
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
        dataStream.forward(
          new ReadableStream({
            start(controller) {
              controller.enqueue('1a');
              controller.enqueue('1b');
              controller.close();
            },
          }),
        );
      },
    });

    expect(await convertReadableStreamToArray(stream)).toEqual(['1a', '1b']);
  });

  it('should forward elements from multiple streams and data parts', async () => {
    let controller1: ReadableStreamDefaultController<string>;
    let controller2: ReadableStreamDefaultController<string>;

    const stream = createDataStream({
      execute: dataStream => {
        dataStream.appendData('data-part-1');

        dataStream.forward(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );

        controller1!.enqueue('1a');
        dataStream.appendData('data-part-2');
        controller1!.enqueue('1b');

        dataStream.forward(
          new ReadableStream({
            start(controllerArg) {
              controller2 = controllerArg;
            },
          }),
        );

        dataStream.appendData('data-part-3');
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
        dataStream.forward(
          new ReadableStream({
            start(controllerArg) {
              controller1 = controllerArg;
            },
          }),
        );
        dataStream.forward(
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
});
