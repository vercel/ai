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

    // TODO how to support multiple consumers? if we tee, the stitching breaks
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
