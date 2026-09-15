import { smoothStream, type TextStreamPart, type ToolSet } from 'ai';

const providerMetadata = {
  anthropic: { signature: 'sig_issue_14373' },
};

type DeltaType = 'reasoning-delta' | 'text-delta';

async function smooth({
  chunking,
  deltaType,
  text,
}: {
  chunking: 'word' | 'line';
  deltaType: DeltaType;
  text: string;
}) {
  const id = `${chunking}-${deltaType}`;
  const startType =
    deltaType === 'reasoning-delta' ? 'reasoning-start' : 'text-start';
  const endType =
    deltaType === 'reasoning-delta' ? 'reasoning-end' : 'text-end';
  const input: TextStreamPart<ToolSet>[] = [
    { type: startType, id },
    { type: deltaType, id, text, providerMetadata },
    { type: endType, id },
  ];
  const output: TextStreamPart<ToolSet>[] = [];
  const stream = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const part of input) {
        controller.enqueue(part);
      }
      controller.close();
    },
  }).pipeThrough(
    smoothStream<ToolSet>({
      chunking,
      delayInMs: null,
    })({ tools: {} }),
  );

  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    output.push(value);
  }

  return output.filter(
    (part): part is Extract<TextStreamPart<ToolSet>, { type: DeltaType }> =>
      part.type === deltaType,
  );
}

function hasExpectedMetadata(part: { providerMetadata?: unknown }) {
  return (
    JSON.stringify(part.providerMetadata) === JSON.stringify(providerMetadata)
  );
}

async function main() {
  const wordReasoningDeltas = await smooth({
    chunking: 'word',
    deltaType: 'reasoning-delta',
    text: 'First second final',
  });
  const lineTextDeltas = await smooth({
    chunking: 'line',
    deltaType: 'text-delta',
    text: 'First line\nSecond line\nfinal line',
  });

  const expectedWordText = ['First ', 'second ', 'final'];
  const expectedLineText = ['First line\n', 'Second line\n', 'final line'];

  if (
    JSON.stringify(wordReasoningDeltas.map(part => part.text)) !==
      JSON.stringify(expectedWordText) ||
    JSON.stringify(lineTextDeltas.map(part => part.text)) !==
      JSON.stringify(expectedLineText)
  ) {
    throw new Error(
      'Unexpected smoothStream chunking output; the providerMetadata regression could not be evaluated.',
    );
  }

  console.log(
    JSON.stringify(
      {
        wordReasoningDeltas,
        lineTextDeltas,
        expectedProviderMetadata: providerMetadata,
      },
      null,
      2,
    ),
  );

  const missingWordMetadata = wordReasoningDeltas
    .filter(part => !hasExpectedMetadata(part))
    .map(part => part.text);
  const missingLineMetadata = lineTextDeltas
    .filter(part => !hasExpectedMetadata(part))
    .map(part => part.text);

  if (missingWordMetadata.length > 0 || missingLineMetadata.length > 0) {
    throw new Error(
      `ISSUE_14373_REPRODUCED: smoothStream dropped providerMetadata from chunked stream parts; word reasoning-delta missing=${JSON.stringify(missingWordMetadata)}; line text-delta missing=${JSON.stringify(missingLineMetadata)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
