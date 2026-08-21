import { toUIMessageStream } from '../../../../packages/langchain/dist/index.mjs';

type LangGraphMessageChunk = {
  type: 'AIMessageChunk';
  id: string;
  content: [];
  contentBlocks: Array<{ type: 'reasoning'; reasoning: string }>;
};

function reasoningChunk(id: string, reasoning: string): LangGraphMessageChunk {
  return {
    type: 'AIMessageChunk',
    id,
    content: [],
    contentBlocks: [{ type: 'reasoning', reasoning }],
  };
}

async function main() {
  const rootMessageId = 'root-message';
  const subagentMessageId = 'subagent-message';

  const events = [
    [
      [],
      'messages',
      [
        reasoningChunk(rootMessageId, 'root reasoning part 1'),
        { langgraph_step: 5 },
      ],
    ],
    [
      ['tools:subagent-call'],
      'messages',
      [
        reasoningChunk(subagentMessageId, 'subagent reasoning'),
        { langgraph_step: 1 },
      ],
    ],
    [
      [],
      'messages',
      [
        reasoningChunk(rootMessageId, 'root reasoning part 2'),
        { langgraph_step: 5 },
      ],
    ],
  ];

  const input = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(event);
      }
      controller.close();
    },
  });

  const chunks = [];
  const reader = toUIMessageStream(input).getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
  }

  const lifecycle = chunks.map(chunk => {
    const id = 'id' in chunk ? chunk.id : undefined;
    const delta = 'delta' in chunk ? chunk.delta : undefined;
    return { type: chunk.type, id, delta };
  });

  const rootContinuationIndex = lifecycle.findIndex(
    chunk =>
      chunk.type === 'reasoning-delta' &&
      chunk.id === rootMessageId &&
      chunk.delta === 'root reasoning part 2',
  );
  const prematureRootEndIndex = lifecycle.findIndex(
    (chunk, index) =>
      index < rootContinuationIndex &&
      chunk.type === 'reasoning-end' &&
      chunk.id === rootMessageId,
  );
  const rootReasoningStarts = lifecycle.filter(
    chunk => chunk.type === 'reasoning-start' && chunk.id === rootMessageId,
  ).length;
  const startSteps = lifecycle.filter(
    chunk => chunk.type === 'start-step',
  ).length;
  const finishSteps = lifecycle.filter(
    chunk => chunk.type === 'finish-step',
  ).length;
  const namespacePreserved = chunks.some(chunk => {
    if (!('providerMetadata' in chunk) || chunk.providerMetadata == null) {
      return false;
    }

    const langchain = chunk.providerMetadata.langchain;
    return langchain != null && 'namespace' in langchain;
  });

  console.log(
    JSON.stringify(
      {
        lifecycle,
        rootReasoningStarts,
        startSteps,
        finishSteps,
        namespacePreserved,
      },
      null,
      2,
    ),
  );

  if (
    rootContinuationIndex !== -1 &&
    prematureRootEndIndex !== -1 &&
    rootReasoningStarts === 2 &&
    startSteps === 3 &&
    finishSteps === 3
  ) {
    throw new Error(
      'ISSUE_18504_REPRODUCED: root reasoning ended before its continuation after an interleaved subgraph event',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
