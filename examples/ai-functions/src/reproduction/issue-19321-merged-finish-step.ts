import {
  createUIMessageStream,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

type StreamingPartType = 'text' | 'reasoning';

const wait = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

async function reproducePartContinuation(partType: StreamingPartType) {
  const id = `${partType}-from-source-a`;
  const firstHalf = partType === 'text' ? 'first half ' : 'first thought ';
  const secondHalf = partType === 'text' ? 'second half' : 'second thought';

  const sourceA = new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: `${partType}-start`, id });
      controller.enqueue({
        type: `${partType}-delta`,
        id,
        delta: firstHalf,
      });

      await wait(50);

      controller.enqueue({
        type: `${partType}-delta`,
        id,
        delta: secondHalf,
      });
      controller.enqueue({ type: `${partType}-end`, id });
      controller.close();
    },
  });

  const sourceB = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'start-step' });
      controller.enqueue({ type: 'finish-step' });
      controller.close();
    },
  });

  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.merge(sourceA);
      writer.merge(sourceB);
    },
  });

  const errors: unknown[] = [];
  let lastMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({
    stream,
    onError: error => errors.push(error),
  })) {
    lastMessage = message;
  }

  const renderedText =
    lastMessage?.parts
      .flatMap(part => (part.type === partType ? [part.text] : []))
      .join('') ?? '';

  return {
    partType,
    expectedText: firstHalf + secondHalf,
    renderedText,
    errors: errors.map(error =>
      error instanceof Error ? error.message : String(error),
    ),
  };
}

async function main() {
  const results = await Promise.all([
    reproducePartContinuation('text'),
    reproducePartContinuation('reasoning'),
  ]);

  console.log(JSON.stringify(results, null, 2));

  const failedResults = results.filter(
    result =>
      result.errors.length > 0 || result.renderedText !== result.expectedText,
  );

  if (failedResults.length > 0) {
    throw new Error(
      "ISSUE_19321_REPRODUCED: an interleaved finish-step invalidated another merged source's open text/reasoning part, aborting both continuations.",
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
