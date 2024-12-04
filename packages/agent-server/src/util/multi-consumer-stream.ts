import { generateId } from '@ai-sdk/provider-utils';

export class MultiConsumerStream<CHUNK> {
  private readonly reader: ReadableStreamDefaultReader<CHUNK>;
  private consumers: Consumer<CHUNK>[] = [];
  private isPulling = false;

  constructor({ stream }: { stream: ReadableStream<CHUNK> }) {
    this.reader = stream.getReader();
  }

  private async pull() {
    if (this.isPulling) {
      return;
    }

    this.isPulling = true;

    const result = await this.reader.read();

    // TODO how to wait here? other streams must not block,
    // but there is a risk that we get race conditions and
    // out of order delivery if we don't wait here
    // maybe we need a counter to enable each consumer
    // to validate/maintain order
    this.consumers.forEach(consumer => {
      consumer.consumeResult(result);
    });

    this.isPulling = false;
  }

  private removeConsumer(consumerId: string) {
    this.consumers = this.consumers.filter(
      consumer => consumer.id !== consumerId,
    );
  }

  split(): ReadableStream<CHUNK> {
    const self = this;

    let controller!: ReadableStreamDefaultController<CHUNK>;
    const consumerId = generateId();

    const stream = new ReadableStream<CHUNK>({
      start(controllerArg) {
        controller = controllerArg;
      },

      async pull() {
        return self.pull(); // TODO catch errors
      },

      cancel() {
        self.removeConsumer(consumerId);
      },
    });

    this.consumers.push(new Consumer({ controller, id: consumerId }));

    return stream;
  }
}

class Consumer<CHUNK> {
  private readonly controller: ReadableStreamDefaultController<CHUNK>;
  readonly id: string;

  constructor({
    controller,
    id,
  }: {
    controller: ReadableStreamDefaultController<CHUNK>;
    id: string;
  }) {
    this.controller = controller;
    this.id = id;
  }

  consumeResult(result: ReadableStreamReadResult<CHUNK>) {
    if (result.done) {
      this.controller.close();
    } else {
      this.controller.enqueue(result.value);
    }
  }
}
