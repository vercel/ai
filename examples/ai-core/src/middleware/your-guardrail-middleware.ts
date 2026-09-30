import type {
  LanguageModelV2Middleware,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';

const redactText = (text: string) => text.replace(/badword/g, '<REDACTED>');

export const yourGuardrailMiddleware: LanguageModelV2Middleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();

    // filtering approach, e.g. for PII or other sensitive information:
    const content = result.content.map(part =>
      part.type === 'text' ? { ...part, text: redactText(part.text) } : part,
    );

    return { ...result, content };
  },

  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();

    // Keep a separate buffer for each text block in the stream.
    const buffers = new Map<string, string>();

    const transformStream = new TransformStream<
      LanguageModelV2StreamPart,
      LanguageModelV2StreamPart
    >({
      transform(chunk, controller) {
        if (chunk.type === 'text-start') {
          buffers.set(chunk.id, '');
          controller.enqueue(chunk);
          return;
        }

        if (chunk.type === 'text-delta') {
          buffers.set(chunk.id, (buffers.get(chunk.id) ?? '') + chunk.delta);
          return;
        }

        if (chunk.type === 'text-end') {
          const bufferedText = buffers.get(chunk.id);

          if (bufferedText != null) {
            const redactedText = redactText(bufferedText);

            if (redactedText) {
              controller.enqueue({
                type: 'text-delta',
                id: chunk.id,
                delta: redactedText,
              });
            }

            buffers.delete(chunk.id);
          }
        }

        controller.enqueue(chunk);
      },

      flush(controller) {
        for (const [id, bufferedText] of buffers) {
          const redactedText = redactText(bufferedText);

          if (redactedText) {
            controller.enqueue({
              type: 'text-delta',
              id,
              delta: redactedText,
            });
          }
        }
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};
