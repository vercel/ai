import { smoothStream } from '../../../../packages/ai/src/generate-text/smooth-stream';
import type { TextStreamPart } from '../../../../packages/ai/src/generate-text/stream-text-result';
import type { ToolSet } from '../../../../packages/ai/src/generate-text/tool-set';

const expectedProviderMetadata = {
  testProvider: { signature: 'sig_issue_14373' },
};

async function collect(
  parts: TextStreamPart<ToolSet>[],
  chunking: 'word' | 'line',
): Promise<TextStreamPart<ToolSet>[]> {
  const stream = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  }).pipeThrough(
    smoothStream({
      chunking,
      delayInMs: null,
    })({ tools: {} }),
  );

  const output: TextStreamPart<ToolSet>[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return output;
    }
    output.push(value);
  }
}

function hasExpectedMetadata(part: { providerMetadata?: unknown }) {
  return (
    JSON.stringify(part.providerMetadata) ===
    JSON.stringify(expectedProviderMetadata)
  );
}

async function reproduceTextDeltaLoss(chunking: 'word' | 'line', text: string) {
  const output = await collect(
    [
      { type: 'text-start', id: chunking },
      {
        type: 'text-delta',
        id: chunking,
        text,
        providerMetadata: expectedProviderMetadata,
      },
      { type: 'text-end', id: chunking },
    ],
    chunking,
  );

  const deltas = output.filter(part => part.type === 'text-delta');

  if (deltas.length < 2 || deltas.map(part => part.text).join('') !== text) {
    throw new Error(`${chunking} chunking did not produce the expected text`);
  }

  return {
    chunking,
    deltas,
    missingMetadata: deltas
      .filter(part => !hasExpectedMetadata(part))
      .map(part => part.text),
  };
}

async function verifyReasoningMetadataPreserved() {
  const output = await collect(
    [
      { type: 'reasoning-start', id: 'reasoning' },
      {
        type: 'reasoning-delta',
        id: 'reasoning',
        text: 'First second final',
        providerMetadata: expectedProviderMetadata,
      },
      { type: 'reasoning-end', id: 'reasoning' },
    ],
    'word',
  );
  const deltas = output.filter(part => part.type === 'reasoning-delta');

  if (
    deltas.length === 0 ||
    deltas.map(part => part.text).join('') !== 'First second final' ||
    deltas.some(part => !hasExpectedMetadata(part))
  ) {
    throw new Error('reasoning-delta content or providerMetadata was lost');
  }
}

async function main() {
  const results = await Promise.all([
    reproduceTextDeltaLoss('word', 'First second final'),
    reproduceTextDeltaLoss('line', 'First line\nSecond line\nFinal line'),
  ]);

  await verifyReasoningMetadataPreserved();

  const failures = results.filter(result => result.missingMetadata.length > 0);

  console.log(JSON.stringify(results, null, 2));

  if (failures.length > 0) {
    console.error(
      'ISSUE_14373_REPRODUCED: smoothStream dropped providerMetadata from chunked text-delta parts.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'providerMetadata was preserved on every chunked text-delta part.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
