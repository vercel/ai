import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { expect, it } from 'vitest';
import { createDataStream } from './create-data-stream';

describe('createDataStream', () => {
  it('should send single data json and close the stream', async () => {
    const stream = createDataStream(dataStream => {
      dataStream.appendData('1a');
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('data', ['1a']),
    ]);
  });

  it('should send message annotation and close the stream', async () => {
    const stream = createDataStream(dataStream => {
      dataStream.appendMessageAnnotation({
        type: 'message-annotation',
        value: '1a',
      });
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      formatDataStreamPart('message_annotations', [
        { type: 'message-annotation', value: '1a' },
      ]),
    ]);
  });
});
