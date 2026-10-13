import {
  isToolUIPart,
  tool,
  validateUIMessages,
  type InferUITools,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

const expectedTitle = 'Search the web';
const expectedPartCount = 14;

const tools = {
  webSearch: tool({
    title: expectedTitle,
    description: 'Search the web',
    inputSchema: z.object({ q: z.string() }),
    outputSchema: z.object({ text: z.string() }),
  }),
};

type TestMessage = UIMessage<unknown, never, InferUITools<typeof tools>>;

const stateCases = [
  {
    state: 'input-streaming',
    input: { q: 'wea' },
    rawInput: '{"q":"wea',
  },
  {
    state: 'input-available',
    input: { q: 'weather' },
  },
  {
    state: 'approval-requested',
    input: { q: 'weather' },
    approval: { id: 'approval-requested' },
  },
  {
    state: 'approval-responded',
    input: { q: 'weather' },
    approval: { id: 'approval-responded', approved: true },
  },
  {
    state: 'output-available',
    input: { q: 'weather' },
    output: { text: 'sunny' },
  },
  {
    state: 'output-error',
    input: { q: 'weather' },
    errorText: 'Search failed',
  },
  {
    state: 'output-denied',
    input: { q: 'weather' },
    approval: { id: 'approval-denied', approved: false },
  },
] as const;

async function main() {
  const staticParts = stateCases.map((stateCase, index) => ({
    type: 'tool-webSearch',
    toolCallId: `static-${index}`,
    title: expectedTitle,
    toolMetadata: { category: 'research' },
    ...stateCase,
  }));

  const dynamicParts = stateCases.map((stateCase, index) => ({
    type: 'dynamic-tool',
    toolName: 'runtimeSearch',
    toolCallId: `dynamic-${index}`,
    title: expectedTitle,
    toolMetadata: { category: 'research' },
    ...stateCase,
  }));

  const validated = await validateUIMessages<TestMessage>({
    messages: [
      {
        id: 'message-1',
        role: 'assistant',
        parts: [...staticParts, ...dynamicParts],
      },
    ] as unknown as TestMessage[],
    tools,
  });

  const toolParts = validated[0].parts.filter(isToolUIPart);

  if (toolParts.length !== expectedPartCount) {
    throw new Error(
      `Reproduction setup expected ${expectedPartCount} tool parts but validation returned ${toolParts.length}.`,
    );
  }

  const partsWithMetadata = toolParts.filter(
    part => part.toolMetadata?.category === 'research',
  );

  if (partsWithMetadata.length !== expectedPartCount) {
    throw new Error(
      `Reproduction setup expected toolMetadata on ${expectedPartCount} tool parts but found it on ${partsWithMetadata.length}.`,
    );
  }

  const partsWithoutTitle = toolParts.filter(
    part => !('title' in part) || part.title !== expectedTitle,
  );

  if (partsWithoutTitle.length > 0) {
    const affectedParts = partsWithoutTitle
      .map(part => `${part.type}:${part.state}`)
      .join(', ');

    console.error(
      `ISSUE_20106: validateUIMessages stripped title from ${partsWithoutTitle.length} of ${expectedPartCount} tool parts: ${affectedParts}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `validateUIMessages preserved title on all ${expectedPartCount} static and dynamic tool parts.`,
  );
}

main();
