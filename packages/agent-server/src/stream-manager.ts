import { createStitchableStream } from './util/create-stitchable-stream';
import { JSONValue } from '@ai-sdk/provider';

export class StreamManager {
  private streams: Map<
    string,
    {
      stream: ReadableStream<JSONValue>;
      addStream: (stream: ReadableStream<JSONValue>) => void;
      close: () => void;
    }
  >;

  constructor() {
    this.streams = new Map();
  }

  createStream(runId: string): void {
    if (this.streams.has(runId)) {
      throw new Error(`Stream already exists for run ${runId}`);
    }
    this.streams.set(runId, createStitchableStream());
  }

  addToStream(runId: string, stream: ReadableStream): void {
    const stitchableStream = this.streams.get(runId);
    if (!stitchableStream) {
      throw new Error(`No stream found for run ${runId}`);
    }
    stitchableStream.addStream(stream);
  }

  getStream(runId: string) {
    const stitchableStream = this.streams.get(runId);
    if (!stitchableStream) {
      throw new Error(`No stream found for run ${runId}`);
    }

    // how to support multiple consumers? if we tee, the stitching breaks
    // because there is no second consumer, and therefore the stitched
    // stream will not continue to the 2nd stream.
    // therefore we must only tee if there is already a consumer for
    // the stream.

    // TODO what if one of the stream consumers breaks or stops consuming?

    return stitchableStream.stream;
  }

  closeStream(runId: string): void {
    const stitchableStream = this.streams.get(runId);
    if (!stitchableStream) {
      throw new Error(`No stream found for run ${runId}`);
    }

    stitchableStream.close();
    this.streams.delete(runId);
  }
}
