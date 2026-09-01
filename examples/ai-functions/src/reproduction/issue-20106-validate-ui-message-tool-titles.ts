import { tool, validateUIMessages, type InferUITool, type UIMessage } from 'ai';
import { z } from 'zod';

const title = 'Search the web';
const toolMetadata = { category: 'research' };
const input = { q: 'weather' };

const tools = {
  webSearch: tool({
    title,
    description: 'search',
    inputSchema: z.object({ q: z.string() }),
    outputSchema: z.object({ text: z.string() }),
  }),
};

type TestMessage = UIMessage<
  never,
  never,
  { webSearch: InferUITool<(typeof tools)['webSearch']> }
>;

const stateDetails = {
  'input-streaming': { input },
  'input-available': { input },
  'approval-requested': {
    input,
    approval: { id: 'approval-requested' },
  },
  'approval-responded': {
    input,
    approval: { id: 'approval-responded', approved: true },
  },
  'output-available': {
    input,
    output: { text: 'sunny' },
  },
  'output-error': {
    input,
    errorText: 'search failed',
  },
  'output-denied': {
    input,
    approval: { id: 'output-denied', approved: false },
  },
} as const;

async function main() {
  const parts = Object.entries(stateDetails).flatMap(([state, details]) => [
    {
      type: 'tool-webSearch',
      toolCallId: `static-${state}`,
      title,
      toolMetadata,
      state,
      ...details,
    },
    {
      type: 'dynamic-tool',
      toolName: 'webSearch',
      toolCallId: `dynamic-${state}`,
      title,
      toolMetadata,
      state,
      ...details,
    },
  ]);

  const output = await validateUIMessages<TestMessage>({
    messages: [
      {
        id: 'm1',
        role: 'assistant',
        parts,
      },
    ],
    tools,
  });

  const toolParts = output[0].parts.filter(
    part => part.type === 'dynamic-tool' || part.type.startsWith('tool-'),
  ) as Array<{ type: string; state: string; title?: string }>;

  const invalidParts = toolParts.filter(part => part.title !== title);

  if (invalidParts.length > 0) {
    const affectedParts = invalidParts
      .map(part => `${part.type}:${part.state}`)
      .join(', ');

    throw new Error(
      `ISSUE #20106 reproduced: validateUIMessages did not preserve tool-part titles (${affectedParts})`,
    );
  }

  console.log('validateUIMessages preserved every tool-part title');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
