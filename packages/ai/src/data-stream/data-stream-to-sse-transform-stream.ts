import { DataStreamPart } from './data-stream-parts';

export class DataStreamToSSETransformStream extends TransformStream<
  DataStreamPart,
  string
> {
  constructor() {
    super({
      transform(part, controller) {
        controller.enqueue(`data: ${JSON.stringify(part)}\n\n`);
      },
      flush(controller) {
        controller.enqueue('data: [DONE]\n\n');
      },
    });
  }
}
