import {
  readUIMessageStream,
  simulateReadableStream,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const deltaText = 'x'.repeat(100);
const originalStructuredClone = globalThis.structuredClone;

function countAccumulatedTextCodeUnits(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce(
      (total, item) => total + countAccumulatedTextCodeUnits(item),
      0,
    );
  }

  if (value != null && typeof value === 'object') {
    return Object.entries(value).reduce(
      (total, [key, item]) =>
        total +
        (key === 'text' && typeof item === 'string'
          ? item.length
          : countAccumulatedTextCodeUnits(item)),
      0,
    );
  }

  return 0;
}

async function measure(deltaCount: number) {
  let clonedTextCodeUnits = 0;

  globalThis.structuredClone = (<T>(
    value: T,
    options?: StructuredSerializeOptions,
  ) => {
    clonedTextCodeUnits += countAccumulatedTextCodeUnits(value);
    return originalStructuredClone(value, options);
  }) as typeof structuredClone;

  const chunks: UIMessageChunk[] = [
    { type: 'text-start', id: 'text' },
    ...Array.from(
      { length: deltaCount },
      (): UIMessageChunk => ({
        type: 'text-delta',
        id: 'text',
        delta: deltaText,
      }),
    ),
    { type: 'text-end', id: 'text' },
  ];

  let finalMessage: UIMessage | undefined;
  let snapshotCount = 0;

  try {
    for await (const snapshot of readUIMessageStream({
      stream: simulateReadableStream({
        chunks,
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    })) {
      finalMessage = snapshot;
      snapshotCount++;
    }
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }

  const finalText = finalMessage?.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
  const expectedTextLength = deltaCount * deltaText.length;

  if (
    finalText?.length !== expectedTextLength ||
    snapshotCount !== deltaCount + 2
  ) {
    throw new Error(
      `Reproduction setup failed: expected ${expectedTextLength} final text code units and ${deltaCount + 2} snapshots, received ${finalText?.length ?? 0} and ${snapshotCount}.`,
    );
  }

  return {
    clonedTextCodeUnits,
    finalTextCodeUnits: finalText.length,
  };
}

async function main() {
  const smaller = await measure(500);
  const larger = await measure(1000);
  const growthRatio = larger.clonedTextCodeUnits / smaller.clonedTextCodeUnits;
  const amplification = larger.clonedTextCodeUnits / larger.finalTextCodeUnits;

  console.log({
    smaller,
    larger,
    growthRatio: growthRatio.toFixed(2),
    amplification: amplification.toFixed(2),
  });

  if (growthRatio > 3.5 && amplification > 100) {
    throw new Error(
      `ISSUE_18771_REPRODUCED: readUIMessageStream cloned ${larger.clonedTextCodeUnits.toLocaleString('en-US')} accumulated text code units for a ${larger.finalTextCodeUnits.toLocaleString('en-US')}-code-unit message (${amplification.toFixed(2)}x amplification).`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
