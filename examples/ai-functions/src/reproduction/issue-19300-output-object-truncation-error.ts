import assert from 'node:assert/strict';
import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  streamText,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const schema = z.object({
  city: z.string(),
  landmarks: z.array(z.object({ name: z.string() })),
});

const truncatedJson = '{"city": "Cairo", "landmarks": [{"name": "Great';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 30, text: 30, reasoning: undefined },
};

async function captureGenerateError(): Promise<unknown> {
  try {
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: 'text', text: truncatedJson }],
          finishReason: { unified: 'length', raw: 'length' },
          usage,
          warnings: [],
        },
      }),
      output: Output.object({ schema }),
      prompt: 'irrelevant',
    });

    return result.output;
  } catch (error) {
    return error;
  }
}

async function captureStreamError(): Promise<unknown> {
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'response-metadata',
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: truncatedJson },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'length', raw: 'length' },
            usage,
          },
        ]),
      },
    }),
    output: Output.object({ schema }),
    prompt: 'irrelevant',
  });

  for await (const _ of result.partialOutputStream) {
    // Drain the stream so the final output is available.
  }

  try {
    return await result.output;
  } catch (error) {
    return error;
  }
}

function assertDiagnosticObjectError(
  error: unknown,
  source: 'generateText' | 'streamText',
): void {
  if (!NoObjectGeneratedError.isInstance(error)) {
    if (
      source === 'generateText' &&
      NoOutputGeneratedError.isInstance(error) &&
      error.cause === undefined
    ) {
      throw new Error(
        'ISSUE_19300: generateText returned AI_NoOutputGeneratedError without truncated-output diagnostics',
      );
    }

    assert.fail(`${source} did not return AI_NoObjectGeneratedError`);
  }

  assert.equal(error.name, 'AI_NoObjectGeneratedError');
  assert.equal(
    error.message,
    'No object generated: could not parse the response.',
  );
  assert.ok(error.cause instanceof Error);
  assert.equal(error.cause.name, 'AI_JSONParseError');
  assert.equal(error.text, truncatedJson);
  assert.equal(error.finishReason, 'length');
  assert.ok(error.usage != null);
  assert.equal(error.usage.outputTokens, 30);
}

async function main(): Promise<void> {
  const [generateError, streamError] = await Promise.all([
    captureGenerateError(),
    captureStreamError(),
  ]);

  assertDiagnosticObjectError(streamError, 'streamText');
  assertDiagnosticObjectError(generateError, 'generateText');

  console.log(
    'generateText and streamText returned matching diagnostic object errors.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
