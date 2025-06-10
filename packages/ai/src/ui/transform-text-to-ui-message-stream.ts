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
        controller.enqueue({ type: 'text', text: part });
      },

      async flush(controller) {
        controller.enqueue({ type: 'finish-step' });
        controller.enqueue({ type: 'finish' });
      },
    }),
  );
}
