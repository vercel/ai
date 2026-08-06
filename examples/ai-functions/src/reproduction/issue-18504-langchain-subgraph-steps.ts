import { AIMessageChunk } from '@langchain/core/messages';
import { toUIMessageStream } from '@ai-sdk/langchain';
import type { UIMessageChunk } from 'ai';

const rootMessageId = 'root-message';
const subagentMessageId = 'subagent-message';

function reasoningChunk(id: string, reasoning: string) {
  return new AIMessageChunk({
    id,
    content: [{ type: 'reasoning', reasoning }],
  });
}

async function main() {
  const langGraphEvents = [
    [
      [],
      'messages',
      [
        reasoningChunk(rootMessageId, 'root-before-subagent'),
        { langgraph_step: 5, langgraph_node: 'model' },
      ],
    ],
    [
      ['tools:subagent-call'],
      'messages',
      [
        reasoningChunk(subagentMessageId, 'subagent-reasoning'),
        { langgraph_step: 1, langgraph_node: 'model' },
      ],
    ],
    [
      [],
      'messages',
      [
        reasoningChunk(rootMessageId, 'root-after-subagent'),
        { langgraph_step: 5, langgraph_node: 'model' },
      ],
    ],
  ];

  const output = toUIMessageStream(
    new ReadableStream({
      start(controller) {
        for (const event of langGraphEvents) {
          controller.enqueue(event);
        }
        controller.close();
      },
    }),
  );
  const chunks: UIMessageChunk[] = [];
  const reader = output.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  console.log(
    chunks
      .map(chunk => {
        const id = 'id' in chunk ? `:${chunk.id}` : '';
        const delta = 'delta' in chunk ? `:${chunk.delta}` : '';
        return `${chunk.type}${id}${delta}`;
      })
      .join('\n'),
  );

  const namespacePreserved = chunks.some(chunk =>
    JSON.stringify(chunk).includes('tools:subagent-call'),
  );
  console.log(`namespace-preserved:${namespacePreserved}`);

  const rootReasoningStarts = chunks.filter(
    chunk => chunk.type === 'reasoning-start' && chunk.id === rootMessageId,
  ).length;
  const firstRootReasoningEnd = chunks.findIndex(
    chunk => chunk.type === 'reasoning-end' && chunk.id === rootMessageId,
  );
  const rootContinuation = chunks.findIndex(
    chunk =>
      chunk.type === 'reasoning-delta' &&
      chunk.id === rootMessageId &&
      chunk.delta === 'root-after-subagent',
  );

  if (
    rootReasoningStarts > 1 &&
    firstRootReasoningEnd !== -1 &&
    firstRootReasoningEnd < rootContinuation
  ) {
    throw new Error(
      'ISSUE_18504_REPRODUCED: root reasoning was prematurely ended and reopened after an interleaved subgraph event',
    );
  }

  if (rootReasoningStarts !== 1) {
    throw new Error(
      `Unexpected root reasoning lifecycle: expected one reasoning-start, received ${rootReasoningStarts}`,
    );
  }

  console.log(
    'Issue not reproduced: root reasoning remained open across the subgraph event.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
