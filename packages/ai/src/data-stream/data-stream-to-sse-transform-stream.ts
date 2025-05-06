import { DataStreamPart } from './data-stream-parts';

export class DataStreamToSSETransformStream extends TransformStream<
  DataStreamPart,
  string
> {
  constructor() {
    super({
      transform(chunk, controller) {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
      },
      flush(controller) {
        controller.enqueue('data: [DONE]\n\n');
      },
    });
  }
}
