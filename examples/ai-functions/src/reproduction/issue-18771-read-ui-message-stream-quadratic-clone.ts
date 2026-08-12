import {
  readUIMessageStream,
  simulateReadableStream,
  type UIMessageChunk,
} from 'ai';

const failureSignal =
  'ISSUE_18771_REPRODUCED: per-chunk full-message cloning caused quadratic cumulative allocation';

const deltaSize = 100;
const originalStructuredClone = globalThis.structuredClone;

let clonedTextCodeUnits = 0;

globalThis.structuredClone = ((value, options) => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    value.role === 'assistant' &&
    'parts' in value &&
    Array.isArray(value.parts)
  ) {
    clonedTextCodeUnits += value.parts.reduce(
      (total, part) =>
        total +
        (typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string'
          ? part.text.length
          : 0),
      0,
    );
  }

  return originalStructuredClone(value, options);
}) as typeof structuredClone;

async function measureCloneVolume(deltaCount: number) {
  const startCloneVolume = clonedTextCodeUnits;
  const chunks: UIMessageChunk[] = [
    { type: 'text-start', id: 'text-1' },
    ...Array.from(
      { length: deltaCount },
      (): UIMessageChunk => ({
        type: 'text-delta',
        id: 'text-1',
        delta: 'x'.repeat(deltaSize),
      }),
    ),
    { type: 'text-end', id: 'text-1' },
  ];

  let finalText = '';

  for await (const snapshot of readUIMessageStream({
    stream: simulateReadableStream({
      chunks,
      initialDelayInMs: null,
      chunkDelayInMs: null,
    }),
  })) {
    const textPart = snapshot.parts.find(part => part.type === 'text');
    finalText = textPart?.text ?? finalText;
  }

  const expectedFinalLength = deltaCount * deltaSize;

  if (finalText.length !== expectedFinalLength) {
    throw new Error(
      `Unexpected final text length: expected ${expectedFinalLength}, received ${finalText.length}`,
    );
  }

  return {
    cloneVolume: clonedTextCodeUnits - startCloneVolume,
    finalLength: finalText.length,
  };
}

async function main() {
  try {
    const small = await measureCloneVolume(500);
    const large = await measureCloneVolume(1000);
    const growthRatio = large.cloneVolume / small.cloneVolume;
    const allocationAmplification = large.cloneVolume / large.finalLength;

    if (large.cloneVolume > large.finalLength * 10 && growthRatio > 3.8) {
      throw new Error(
        `${failureSignal}; final text=${large.finalLength} code units, cumulative cloned text=${large.cloneVolume} code units, 2x input growth=${growthRatio.toFixed(2)}x clone-volume growth, amplification=${allocationAmplification.toFixed(2)}x`,
      );
    }

    console.log(
      `PASS: clone volume remained non-quadratic (${large.cloneVolume} cloned code units for ${large.finalLength} final code units).`,
    );
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }
}

await main();
