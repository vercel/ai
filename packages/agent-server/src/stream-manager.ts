import { createStitchableStream } from './util/create-stitchable-stream';

export class StreamManager {
  private streams: Map<string, ReturnType<typeof createStitchableStream>>;

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

  getStream(runId: string): ReadableStream {
    const stitchableStream = this.streams.get(runId);
    if (!stitchableStream) {
      throw new Error(`No stream found for run ${runId}`);
    }

    // Create a new teed stream for this consumer
    const [newStream] = stitchableStream.stream.tee();

    return newStream;
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
