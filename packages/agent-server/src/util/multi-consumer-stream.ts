export class MultiConsumerStream<CHUNK> {
  private readonly reader: ReadableStreamDefaultReader<CHUNK>;
  private readonly consumers: Consumer<CHUNK>[] = [];

  constructor({ stream }: { stream: ReadableStream<CHUNK> }) {
    this.reader = stream.getReader();
  }

  private async pull() {
    const result = await this.reader.read();
    this.consumers.forEach(consumer => {
      consumer.consumeResult(result);
    });
  }

  split(): ReadableStream<CHUNK> {
    const doPull = this.pull.bind(this);
    let controller!: ReadableStreamDefaultController<CHUNK>;
    const stream = new ReadableStream<CHUNK>({
      start(controllerArg) {
        controller = controllerArg;
      },
      async pull() {
        doPull(); // TODO catch errors
      },
    });

    this.consumers.push(new Consumer(controller));

    return stream;
  }
}

class Consumer<CHUNK> {
  private readonly controller: ReadableStreamDefaultController<CHUNK>;

  constructor(controller: ReadableStreamDefaultController<CHUNK>) {
    this.controller = controller;
  }

  consumeResult(result: ReadableStreamReadResult<CHUNK>) {
    if (result.done) {
      this.controller.close();
    } else {
      this.controller.enqueue(result.value);
    }
  }
}
