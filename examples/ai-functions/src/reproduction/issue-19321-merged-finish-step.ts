import {
  createUIMessageStream,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const expectedText = 'first half second half';
const missingPartError =
  'Received text-delta for missing text part with ID "a".';

async function main() {
  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.merge(
        new ReadableStream<UIMessageChunk>({
          async start(controller) {
            controller.enqueue({ type: 'text-start', id: 'a' });
            controller.enqueue({
              type: 'text-delta',
              id: 'a',
              delta: 'first half ',
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            controller.enqueue({
              type: 'text-delta',
              id: 'a',
              delta: 'second half',
            });
            controller.enqueue({ type: 'text-end', id: 'a' });
            controller.close();
          },
        }),
      );

      writer.merge(
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: 'start-step' });
            controller.enqueue({ type: 'finish-step' });
            controller.close();
          },
        }),
      );
    },
  });

  const errors: unknown[] = [];
  let finalMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({
    stream,
    onError: error => {
      errors.push(error);
    },
  })) {
    finalMessage = message;
  }

  const finalText =
    finalMessage?.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('') ?? '';

  const reportedError = errors.find(
    error => error instanceof Error && error.message.includes(missingPartError),
  );

  if (reportedError != null && finalText !== expectedText) {
    throw new Error(
      `Reproduced issue #19321: merged UI message stream aborted after another source's finish-step; expected "${expectedText}", received "${finalText}". ${missingPartError}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Unexpected stream error: ${errors
        .map(error => (error instanceof Error ? error.message : String(error)))
        .join('; ')}`,
    );
  }

  if (finalText !== expectedText) {
    throw new Error(
      `Merged UI message stream completed without an error but produced "${finalText}" instead of "${expectedText}".`,
    );
  }

  console.log(`Merged UI message text: ${finalText}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
