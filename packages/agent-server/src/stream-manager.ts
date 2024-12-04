import { createStitchableStream } from './util/create-stitchable-stream';
import { JSONValue } from '@ai-sdk/provider';
import { MultiConsumerStream } from './util/multi-consumer-stream';

export class StreamManager {
  private streams: Map<
    string,
    {
      addStream: (stream: ReadableStream<JSONValue>) => void;
      close: () => void;
      multiStream: MultiConsumerStream<JSONValue>;
    }
  >;

  constructor() {
    this.streams = new Map();
  }

  createStream(runId: string): void {
    if (this.streams.has(runId)) {
      throw new Error(`Stream already exists for run ${runId}`);
    }
    const { stream, addStream, close } = createStitchableStream<JSONValue>();

    this.streams.set(runId, {
      addStream,
      close,
      multiStream: new MultiConsumerStream({ stream }),
    });
  }

  addToStream(runId: string, streamArg: ReadableStream): void {
    const stream = this.streams.get(runId);
    if (!stream) {
      throw new Error(`No stream found for run ${runId}`);
    }
    stream.addStream(streamArg);
  }

  getStream(runId: string) {
    const stream = this.streams.get(runId);
    if (!stream) {
      throw new Error(`No stream found for run ${runId}`);
    }
    return stream.multiStream.split();
  }

  closeStream(runId: string): void {
    const stream = this.streams.get(runId);
    if (!stream) {
      throw new Error(`No stream found for run ${runId}`);
    }

    stream.close();
    this.streams.delete(runId);
  }
}
