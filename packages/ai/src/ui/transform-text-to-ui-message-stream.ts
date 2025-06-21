import { UIMessageStreamPart } from '../ui-message-stream';

export function transformTextToUiMessageStream({
  stream,
}: {
  stream: ReadableStream<string>;
}) {
  return stream.pipeThrough(
    new TransformStream<string, UIMessageStreamPart<never, never>>({
      start(controller) {
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'start-step' });
      },

      async transform(part, controller) {
        controller.enqueue({ type: 'text-start', id: 'text-1' });
        controller.enqueue({ type: 'text-delta', id: 'text-1', delta: part });
        controller.enqueue({ type: 'text-end', id: 'text-1' });
      },

      async flush(controller) {
        controller.enqueue({ type: 'finish-step' });
        controller.enqueue({ type: 'finish' });
      },
    }),
  );
}
