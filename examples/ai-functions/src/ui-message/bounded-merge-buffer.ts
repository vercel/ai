import { createUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';

const totalChunks = 20;
let pulls = 0;

type CountMessage = UIMessage<unknown, { count: number }>;

const source = new ReadableStream<UIMessageChunk<unknown, { count: number }>>({
  pull(controller) {
    if (pulls === totalChunks) {
      controller.close();
      return;
    }

    pulls++;
    controller.enqueue({
      type: 'data-count',
      data: pulls,
    });
  },
});

const stream = createUIMessageStream<CountMessage>({
  maxBufferedChunks: 2,
  execute({ writer }) {
    writer.merge(source);
  },
});

// Simulate a client that temporarily stops reading.
await new Promise(resolve => setTimeout(resolve, 10));

const pullsWhileStalled = pulls;
if (pullsWhileStalled >= totalChunks) {
  throw new Error(
    'Expected the merged source to pause while the client stalls.',
  );
}

const chunks: UIMessageChunk<unknown, { count: number }>[] = [];
for await (const chunk of stream) {
  chunks.push(chunk);
}

const values = chunks.flatMap(chunk =>
  chunk.type === 'data-count' ? [chunk.data] : [],
);

if (
  values.length !== totalChunks ||
  values.some((value, index) => value !== index + 1)
) {
  throw new Error('Expected all merged chunks to resume in source order.');
}

console.log({
  pullsWhileStalled,
  receivedChunks: values.length,
});
