import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import {
  extractJsonMiddleware,
  generateText,
  NoObjectGeneratedError,
  Output,
  streamText,
  wrapLanguageModel,
} from 'ai';
import { z } from 'zod/v4';

const usage: LanguageModelV4Usage = {
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

const finishReason = { unified: 'stop' as const, raw: 'stop' };

function createModel(text: string, streamDeltas: string[]): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    supportedUrls: {},
    async doGenerate() {
      return {
        content: [{ type: 'text' as const, text }],
        finishReason,
        usage,
        warnings: [],
      };
    },
    async doStream() {
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        ...streamDeltas.map(
          (delta): LanguageModelV4StreamPart => ({
            type: 'text-delta',
            id: 'text-1',
            delta,
          }),
        ),
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason, usage },
      ];

      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(part);
            }
            controller.close();
          },
        }),
      };
    },
  };
}

async function readObject<OBJECT>({
  mode,
  text,
  streamDeltas,
  schema,
}: {
  mode: 'generateText' | 'streamText';
  text: string;
  streamDeltas: string[];
  schema: z.ZodType<OBJECT>;
}): Promise<OBJECT> {
  const model = wrapLanguageModel({
    model: createModel(text, streamDeltas),
    middleware: extractJsonMiddleware(),
  });
  const options = {
    model,
    prompt: 'Return JSON.',
    output: Output.object({ schema }),
  };

  if (mode === 'generateText') {
    return (await generateText(options)).output;
  }

  return await streamText(options).output;
}

async function assertBothModes<OBJECT>({
  text,
  expected,
  schema,
  splitStreamIntoCharacters = false,
}: {
  text: string;
  expected: OBJECT;
  schema: z.ZodType<OBJECT>;
  splitStreamIntoCharacters?: boolean;
}) {
  for (const mode of ['generateText', 'streamText'] as const) {
    assert.deepEqual(
      await readObject({
        mode,
        text,
        streamDeltas:
          mode === 'streamText' && splitStreamIntoCharacters
            ? Array.from(text)
            : [text],
        schema,
      }),
      expected,
    );
  }
}

async function main() {
  const basicSchema = z.object({ ok: z.boolean() });

  // Controls: unfenced JSON remains supported, and JSON-string whitespace is
  // preserved while ordinary fences are stripped.
  await assertBothModes({
    text: '{"ok":true}',
    expected: { ok: true },
    schema: basicSchema,
  });
  await assertBothModes({
    text: '```json\n{"ok":true,"note":"  keep  "}\n```',
    expected: { ok: true, note: '  keep  ' },
    schema: z.object({ ok: z.boolean(), note: z.string() }),
  });

  const text = ' \n```json\n{"ok":true}\n```';
  const failedModes: string[] = [];

  for (const mode of ['generateText', 'streamText'] as const) {
    try {
      assert.deepEqual(
        await readObject({
          mode,
          text,
          // This places the leading whitespace and opening fence in separate
          // chunks, including splitting the fence itself across chunks.
          streamDeltas: Array.from(text),
          schema: basicSchema,
        }),
        { ok: true },
      );
    } catch (error) {
      if (
        !NoObjectGeneratedError.isInstance(error) ||
        error.message !== 'No object generated: could not parse the response.'
      ) {
        throw error;
      }
      failedModes.push(mode);
    }
  }

  assert.deepEqual(
    failedModes,
    ['generateText', 'streamText'],
    `Expected both reported modes to reject the valid object, got: ${failedModes.join(', ') || 'none'}`,
  );

  console.error(
    'ISSUE_22584_REPRODUCED: generateText and streamText rejected valid fenced JSON with leading whitespace',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_FAILURE', error);
  process.exitCode = 2;
});
