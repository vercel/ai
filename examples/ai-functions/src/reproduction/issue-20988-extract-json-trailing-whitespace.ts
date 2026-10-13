import assert from 'node:assert/strict';
import type {
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import {
  extractJsonMiddleware,
  generateText,
  Output,
  streamText,
  wrapLanguageModel,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod/v4';

const json = '{"value":"example"}';
const expectedOutput = { value: 'example' };

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

const schema = z.object({ value: z.string() });

type ChunkLayout = 'single-delta' | 'character-deltas' | 'split-suffix';

function createTextDeltas(
  text: string,
  trailingWhitespace: string,
  layout: ChunkLayout,
): string[] {
  if (layout === 'single-delta') {
    return [text];
  }

  if (layout === 'character-deltas') {
    return [...text];
  }

  return [`\`\`\`json\n${json}`, '\n`', '``', trailingWhitespace];
}

function createModel({
  text,
  trailingWhitespace,
  layout,
  middleware = extractJsonMiddleware(),
}: {
  text: string;
  trailingWhitespace: string;
  layout: ChunkLayout;
  middleware?: ReturnType<typeof extractJsonMiddleware>;
}) {
  const streamParts: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    ...createTextDeltas(text, trailingWhitespace, layout).map(
      delta =>
        ({
          type: 'text-delta',
          id: 't',
          delta,
        }) satisfies LanguageModelV3StreamPart,
    ),
    { type: 'text-end', id: 't' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
  ];

  return wrapLanguageModel({
    model: new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
      doStream: {
        stream: convertArrayToReadableStream(streamParts),
      },
    }),
    middleware,
  });
}

async function verifyGenerateTextControl(trailingWhitespace: string) {
  const text = `\`\`\`json\n${json}\n\`\`\`${trailingWhitespace}`;
  const result = await generateText({
    model: createModel({
      text,
      trailingWhitespace,
      layout: 'single-delta',
    }),
    prompt: 'Return the synthetic example as JSON.',
    output: Output.object({ schema }),
    maxRetries: 0,
  });

  assert.deepEqual(result.output, expectedOutput);
  assert.equal(result.text, json);
}

async function readStreamResult({
  text,
  trailingWhitespace,
  layout,
  middleware,
}: {
  text: string;
  trailingWhitespace: string;
  layout: ChunkLayout;
  middleware?: ReturnType<typeof extractJsonMiddleware>;
}) {
  const result = streamText({
    model: createModel({ text, trailingWhitespace, layout, middleware }),
    prompt: 'Return the synthetic example as JSON.',
    output: Output.object({ schema }),
    maxRetries: 0,
  });

  const [outputResult, streamedText] = await Promise.all([
    result.output.then(
      value => ({ status: 'fulfilled' as const, value }),
      error => ({ status: 'rejected' as const, error }),
    ),
    result.text,
  ]);

  return { outputResult, streamedText };
}

async function verifyPassingStreamControls() {
  const trailingWhitespace = ' '.repeat(10);

  const unfenced = await readStreamResult({
    text: json + trailingWhitespace,
    trailingWhitespace,
    layout: 'single-delta',
  });
  assert.equal(unfenced.outputResult.status, 'fulfilled');
  if (unfenced.outputResult.status === 'fulfilled') {
    assert.deepEqual(unfenced.outputResult.value, expectedOutput);
  }
  assert.equal(unfenced.streamedText, json);

  const customTransform = await readStreamResult({
    text: `\`\`\`json\n${json}\n\`\`\`${trailingWhitespace}`,
    trailingWhitespace,
    layout: 'single-delta',
    middleware: extractJsonMiddleware({
      transform: text =>
        text
          .replace(/^```(?:json)?\s*\n?/, '')
          .replace(/\n?```\s*$/, '')
          .trim(),
    }),
  });
  assert.equal(customTransform.outputResult.status, 'fulfilled');
  if (customTransform.outputResult.status === 'fulfilled') {
    assert.deepEqual(customTransform.outputResult.value, expectedOutput);
  }
  assert.equal(customTransform.streamedText, json);
}

async function main() {
  try {
    await verifyGenerateTextControl(' '.repeat(10));
    await verifyGenerateTextControl('\n'.repeat(10));
    await verifyPassingStreamControls();
  } catch (error) {
    console.error('ISSUE_20988_CONTROL_FAILURE', error);
    process.exitCode = 2;
    return;
  }

  const failures: string[] = [];
  const layouts: ChunkLayout[] = [
    'single-delta',
    'character-deltas',
    'split-suffix',
  ];
  const whitespaceCases = [
    { name: 'spaces', value: ' '.repeat(10) },
    { name: 'newlines', value: '\n'.repeat(10) },
  ];

  for (const whitespace of whitespaceCases) {
    const text = `\`\`\`json\n${json}\n\`\`\`${whitespace.value}`;

    for (const layout of layouts) {
      const { outputResult, streamedText } = await readStreamResult({
        text,
        trailingWhitespace: whitespace.value,
        layout,
      });

      const outputMatches =
        outputResult.status === 'fulfilled' &&
        outputResult.value.value === expectedOutput.value;
      const textMatches = streamedText === json;

      if (!outputMatches || !textMatches) {
        const outputDescription =
          outputResult.status === 'fulfilled'
            ? JSON.stringify(outputResult.value)
            : outputResult.error instanceof Error
              ? outputResult.error.name
              : String(outputResult.error);
        failures.push(
          `${whitespace.name}/${layout}: output=${outputDescription}, text=${JSON.stringify(streamedText)}`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    throw new Error(
      `ISSUE_20988_REPRODUCED: ${failures.length}/6 streamed fenced JSON scenarios failed while generateText and controls passed`,
    );
  }

  console.log(
    'Issue 20988 not reproduced: all streamed fenced JSON scenarios passed.',
  );
}

main();
