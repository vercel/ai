export class MultiConsumerStream<CHUNK> {
  private readonly stream: ReadableStream<CHUNK>;

  constructor({ stream }: { stream: ReadableStream<CHUNK> }) {
    this.stream = stream;
  }

  split(): ReadableStream<CHUNK> {
    return this.stream;
  }
}
