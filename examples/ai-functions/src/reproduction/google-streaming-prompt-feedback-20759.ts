import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';

const usage = {
  promptTokenCount: 10,
  candidatesTokenCount: 0,
  totalTokenCount: 10,
};

const candidate = {
  content: { role: 'model', parts: [{ text: 'Fixture text.' }] },
  finishReason: 'STOP',
};

type Adapter = 'public' | 'vertex-internal';

async function readStream<T>(stream: ReadableStream<T>) {
  const reader = stream.getReader();
  const values: Array<T> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return values;
    }
    values.push(value);
  }
}

async function run(adapter: Adapter, chunks: Array<unknown>) {
  const fixtureFetch: typeof fetch = async () =>
    new Response(
      chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(''),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );

  const model =
    adapter === 'public'
      ? createGoogleGenerativeAI({
          apiKey: 'fixture',
          fetch: fixtureFetch,
        })('gemini-3.7-flash')
      : new GoogleGenerativeAILanguageModel('gemini-3.7-flash', {
          provider: 'google.vertex',
          baseURL: 'https://fixture.invalid',
          headers: {},
          generateId: () => 'fixture-id',
          fetch: fixtureFetch,
        });

  const result = await model.doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Fixture.' }],
      },
    ],
  });

  const parts = await readStream(result.stream);

  assert.deepEqual(
    parts.filter(part => part.type === 'error'),
    [],
    `${adapter}: fixture stream must parse without errors`,
  );

  const finish = parts.find(part => part.type === 'finish');
  assert.ok(finish, `${adapter}: fixture stream must emit a finish event`);

  const metadata =
    finish.providerMetadata?.[adapter === 'public' ? 'google' : 'vertex'];

  return { parts, finish, metadata };
}

async function main() {
  const violations: Array<string> = [];

  for (const adapter of ['public', 'vertex-internal'] as const) {
    for (const blockReason of [
      '',
      'BLOCK_REASON_UNSPECIFIED',
      'BLOCKED_REASON_UNSPECIFIED',
    ]) {
      const { finish } = await run(adapter, [
        {
          candidates: [],
          promptFeedback: { blockReason },
          usageMetadata: usage,
        },
      ]);

      if (
        finish.finishReason.unified !== 'other' ||
        finish.finishReason.raw !== undefined
      ) {
        violations.push(
          `${adapter}: default block reason ${JSON.stringify(blockReason)} was classified as ${finish.finishReason.unified}/${String(finish.finishReason.raw)}`,
        );
      }
    }

    const feedback = {
      blockReason: 'BLOCK_REASON_UNSPECIFIED',
      safetyRatings: [],
    };
    const finalUsage = {
      ...usage,
      candidatesTokenCount: 3,
      totalTokenCount: 13,
    };
    const split = await run(adapter, [
      { promptFeedback: feedback },
      { candidates: [candidate] },
      { usageMetadata: finalUsage },
    ]);

    if (!isDeepStrictEqual(split.metadata?.promptFeedback, feedback)) {
      violations.push(`${adapter}: prompt feedback was lost across chunks`);
    }
    if (!isDeepStrictEqual(split.metadata?.usageMetadata, finalUsage)) {
      violations.push(
        `${adapter}: raw usage metadata did not retain the trailing usage chunk`,
      );
    }
    if (split.finish.usage.outputTokens.total !== 3) {
      violations.push(
        `${adapter}: normalized output usage did not retain the trailing usage chunk`,
      );
    }

    const blocked = await run(adapter, [
      { promptFeedback: { blockReason: 'SAFETY' } },
      { candidates: [candidate] },
      {
        promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' },
        usageMetadata: usage,
      },
    ]);

    if (
      !isDeepStrictEqual(blocked.finish.finishReason, {
        unified: 'content-filter',
        raw: 'SAFETY',
      })
    ) {
      violations.push(
        `${adapter}: a later chunk replaced the confirmed SAFETY block`,
      );
    }
    if (
      !isDeepStrictEqual(blocked.metadata?.promptFeedback, {
        blockReason: 'SAFETY',
      })
    ) {
      violations.push(
        `${adapter}: a later chunk replaced the confirmed SAFETY feedback`,
      );
    }
    if (blocked.parts.some(part => part.type === 'text-delta')) {
      violations.push(
        `${adapter}: text was emitted after the confirmed SAFETY block`,
      );
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `ISSUE_20759_PRIMARY_BUG: Google streaming prompt feedback is not retained as terminal stream state\n${violations.join('\n')}`,
    );
  }
}

main();
