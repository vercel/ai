import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import type { UIMessageChunk } from 'ai';

const cursor = 4;
const workflowTransformModule = [
  '../../../../packages/workflow/src',
  'to-ui-message-chunk.ts',
].join('/');

type RawPart = { type: string; [key: string]: unknown };

const rawToolTurn: RawPart[] = [
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', text: 'Checking' },
  { type: 'text-end', id: 'text-1' },
  { type: 'tool-input-start', id: 'call-1', toolName: 'weather' },
  { type: 'tool-input-delta', id: 'call-1', delta: '{"city":"London"}' },
  { type: 'tool-input-end', id: 'call-1' },
  {
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'weather',
    input: { city: 'London' },
  },
  {
    type: 'tool-result',
    toolCallId: 'call-1',
    toolName: 'weather',
    input: { city: 'London' },
    output: { temperature: 18 },
  },
  { type: 'text-start', id: 'text-2' },
  { type: 'text-delta', id: 'text-2', text: 'It is 18°C.' },
  { type: 'text-end', id: 'text-2' },
];

type ResumeAwareTransformFactory = (options?: {
  uiStartIndex?: number;
}) => TransformStream<RawPart, UIMessageChunk>;

async function transform(
  parts: RawPart[],
  chunkTransform: TransformStream<RawPart, UIMessageChunk>,
) {
  const stream = new ReadableStream<RawPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  }).pipeThrough(chunkTransform);

  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

async function main() {
  const { createModelCallToUIChunkTransform: createResumeAwareTransform } =
    (await import(workflowTransformModule)) as {
      createModelCallToUIChunkTransform: ResumeAwareTransformFactory;
    };

  const canonical = await transform(rawToolTurn, createResumeAwareTransform());

  assert.equal(rawToolTurn.length, 11);
  assert.equal(canonical.length, 14);

  // This is the reconnect recipe currently shown in the WorkflowAgent docs:
  // pass the UI cursor directly to the raw durable stream, then transform.
  const documentedResume = await transform(
    rawToolTurn.slice(cursor),
    createResumeAwareTransform(),
  );

  assert.deepEqual(
    canonical.slice(cursor, cursor + 3).map(chunk => chunk.type),
    ['text-end', 'tool-input-start', 'tool-input-delta'],
  );
  assert.deepEqual(
    documentedResume.slice(0, 3).map(chunk => chunk.type),
    ['start', 'start-step', 'tool-input-delta'],
  );

  // The compatible fix proposed in the issue replays raw parts from zero and
  // applies the UI-space cursor in the transform.
  const resumed = await transform(
    rawToolTurn,
    createResumeAwareTransform({ uiStartIndex: cursor }),
  );
  const reconstructed = canonical.slice(0, cursor).concat(resumed);

  if (!isDeepStrictEqual(reconstructed, canonical)) {
    throw new Error(
      'ISSUE #19088 REPRODUCED: UI resume invariant failed at cursor 4; documented raw-index resume started [start, start-step, tool-input-delta] instead of [text-end, tool-input-start, tool-input-delta]',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
