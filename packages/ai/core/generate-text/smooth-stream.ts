export function smoothStream({ delayMs = 40 }: { delayMs?: number } = {}) {
  let buffer = '';

  return new TransformStream({
    async transform(chunk, controller) {
      if (chunk.type === 'finish') {
        if (buffer.length > 0) {
          controller.enqueue({ type: 'text-delta', textDelta: buffer });
          buffer = '';
        }

        controller.enqueue(chunk);
        return;
      }

      if (chunk.type !== 'text-delta') {
        controller.enqueue(chunk);
        return;
      }

      buffer += chunk.textDelta;

      // Stream out complete words when whitespace is found
      let isFirst = true;
      while (buffer.match(/\s/)) {
        if (!isFirst && delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        isFirst = false;

        const whitespaceIndex = buffer.search(/\s/);
        const word = buffer.slice(0, whitespaceIndex + 1);
        controller.enqueue({ type: 'text-delta', textDelta: word });
        buffer = buffer.slice(whitespaceIndex + 1);
      }
    },
  });
}
