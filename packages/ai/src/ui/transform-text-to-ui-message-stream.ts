import { UIMessageStreamPart } from '../ui-message-stream';

export function transformTextToUiMessageStream({
  stream,
}: {
  stream: ReadableStream<string>;
}) {
  return stream.pipeThrough(
    new TransformStream<string, UIMessageStreamPart>({
      start(controller) {
        controller.enqueue({ type: 'start', value: {} });
        controller.enqueue({ type: 'start-step', value: {} });
      },

      async transform(part, controller) {
        controller.enqueue({ type: 'text', value: part });
      },

      async flush(controller) {
        controller.enqueue({ type: 'finish-step', value: {} });
        controller.enqueue({ type: 'finish', value: {} });
      },
    }),
  );
}
