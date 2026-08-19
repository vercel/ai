import {
  readUIMessageStream,
  type UIMessageChunk,
} from '../../../../packages/ai/src/index';

const delta = 'x'.repeat(100);
const originalStructuredClone = globalThis.structuredClone;
let clonedTextCodeUnits = 0;
let measureClones = false;

globalThis.structuredClone = (<T>(
  value: T,
  options?: StructuredSerializeOptions,
): T => {
  if (measureClones) {
    const message = value as {
      parts?: Array<{ text?: unknown }>;
    };

    for (const part of message.parts ?? []) {
      if (typeof part.text === 'string') {
        clonedTextCodeUnits += part.text.length;
      }
    }
  }

  return originalStructuredClone(value, options);
}) as typeof structuredClone;

async function measure(deltaCount: number) {
  const chunks: UIMessageChunk[] = [
    { type: 'text-start', id: 'text-1' },
    ...Array.from(
      { length: deltaCount },
      (): UIMessageChunk => ({
        type: 'text-delta',
        id: 'text-1',
        delta,
      }),
    ),
    { type: 'text-end', id: 'text-1' },
  ];

  clonedTextCodeUnits = 0;
  measureClones = true;

  let finalText = '';
  for await (const snapshot of readUIMessageStream({
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
  })) {
    const textPart = snapshot.parts.find(part => part.type === 'text');
    finalText = textPart?.text ?? '';
  }

  measureClones = false;

  const expectedText = delta.repeat(deltaCount);
  if (finalText !== expectedText) {
    throw new Error(
      `Reproduction setup failed: expected ${expectedText.length} final text code units, received ${finalText.length}.`,
    );
  }

  return {
    clonedTextCodeUnits,
    finalTextCodeUnits: finalText.length,
  };
}

async function main() {
  const small = await measure(500);
  const large = await measure(1_000);
  const growth =
    small.clonedTextCodeUnits === 0
      ? 1
      : large.clonedTextCodeUnits / small.clonedTextCodeUnits;
  const amplification = large.clonedTextCodeUnits / large.finalTextCodeUnits;

  if (amplification > 10 && growth > 3.5) {
    console.error(
      `ISSUE_18771_REPRODUCED: readUIMessageStream cloned ${large.clonedTextCodeUnits.toLocaleString('en-US')} accumulated text code units for a ${large.finalTextCodeUnits.toLocaleString('en-US')}-code-unit message (${amplification.toFixed(2)}x amplification; doubling chunks increased clone volume ${growth.toFixed(2)}x).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS: clone volume stayed bounded (${amplification.toFixed(2)}x amplification; ${growth.toFixed(2)}x growth when chunks doubled).`,
  );
}

main().finally(() => {
  globalThis.structuredClone = originalStructuredClone;
});
