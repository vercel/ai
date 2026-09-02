import { smoothStream, type TextStreamPart, type ToolSet } from 'ai';

const signature = 'sig-r1';

function getSignature(part: TextStreamPart<ToolSet>) {
  return (
    part as {
      providerMetadata?: {
        anthropic?: {
          signature?: unknown;
        };
      };
    }
  ).providerMetadata?.anthropic?.signature;
}

async function runScenario({
  name,
  reasoningText,
}: {
  name: string;
  reasoningText: string;
}) {
  const chunks: TextStreamPart<ToolSet>[] = [
    { type: 'reasoning-start', id: 'r1' },
    { type: 'reasoning-delta', id: 'r1', text: reasoningText },
    {
      type: 'reasoning-delta',
      id: 'r1',
      text: '',
      providerMetadata: { anthropic: { signature } },
    },
    { type: 'reasoning-end', id: 'r1' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', text: 'Hello world' },
    { type: 'text-end', id: 't1' },
  ];

  const input = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  const output: TextStreamPart<ToolSet>[] = [];
  const reader = input
    .pipeThrough(smoothStream({ delayInMs: null })({ tools: {} }))
    .getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    output.push(value);
  }

  console.log(
    JSON.stringify(
      {
        name,
        output,
      },
      null,
      2,
    ),
  );

  const signatureParts = output.filter(
    part => getSignature(part) === signature,
  );
  const reasoningSignatureParts = signatureParts.filter(
    part => part.type === 'reasoning-delta' && part.id === 'r1',
  );
  const textSignatureParts = signatureParts.filter(
    part => part.type === 'text-delta',
  );

  const expectedBehavior =
    signatureParts.length === 1 &&
    reasoningSignatureParts.length === 1 &&
    textSignatureParts.length === 0;

  const reportedBug =
    signatureParts.length === 1 &&
    reasoningSignatureParts.length === 0 &&
    textSignatureParts.length === 1 &&
    textSignatureParts[0].id === 't1';

  return { expectedBehavior, reportedBug };
}

async function main() {
  const whitespaceTerminated = await runScenario({
    name: 'reasoning text ends in whitespace',
    reasoningText: 'Let me think. ',
  });
  const emptyReasoning = await runScenario({
    name: 'empty reasoning block',
    reasoningText: '',
  });

  if (
    whitespaceTerminated.expectedBehavior &&
    emptyReasoning.expectedBehavior
  ) {
    console.log(
      'Expected behavior observed: each reasoning signature was emitted exactly once on reasoning part r1 and never on text part t1.',
    );
    return;
  }

  if (whitespaceTerminated.reportedBug && emptyReasoning.reportedBug) {
    throw new Error(
      'Reproduced issue #20214: smoothStream dropped reasoning providerMetadata on an empty buffer and leaked it onto a later text delta.',
    );
  }

  throw new Error(
    'Unexpected smoothStream output: the reasoning signature invariant failed in a shape different from issue #20214.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
