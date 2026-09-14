import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GoogleLanguageModel } from '@ai-sdk/google/internal';
import { isDeepStrictEqual, inspect } from 'node:util';

const usage = {
  promptTokenCount: 10,
  candidatesTokenCount: 0,
  totalTokenCount: 10,
};

const candidate = {
  content: { role: 'model' as const, parts: [{ text: 'Fixture text.' }] },
  finishReason: 'STOP',
};

type Adapter = 'public' | 'vertex-internal';

async function run(adapter: Adapter, chunks: Array<Record<string, unknown>>) {
  const fetch = async () =>
    new Response(
      chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(''),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );

  const model =
    adapter === 'public'
      ? createGoogleGenerativeAI({ apiKey: 'fixture', fetch })(
          'gemini-3.7-flash',
        )
      : new GoogleLanguageModel('gemini-3.7-flash', {
          provider: 'google.vertex',
          baseURL: 'https://fixture.invalid',
          generateId: () => 'fixture-id',
          fetch,
        });

  const result = await model.doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Fixture.' }] }],
  });

  const parts = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }

  const errors = parts.filter(part => part.type === 'error');
  if (errors.length > 0) {
    throw new Error(`Unexpected stream errors: ${inspect(errors)}`);
  }

  const finish = parts.find(part => part.type === 'finish');
  if (finish?.type !== 'finish') {
    throw new Error('Expected a finish stream part');
  }

  const metadata =
    finish.providerMetadata?.[adapter === 'public' ? 'google' : 'googleVertex'];

  return { parts, finish, metadata };
}

async function main() {
  const failures: string[] = [];

  const check = (label: string, actual: unknown, expected: unknown) => {
    if (!isDeepStrictEqual(actual, expected)) {
      failures.push(
        `${label}: expected ${inspect(expected)}, received ${inspect(actual)}`,
      );
    }
  };

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

      check(
        `${adapter} default ${inspect(blockReason)} unified finish reason`,
        finish.finishReason.unified,
        'other',
      );
      check(
        `${adapter} default ${inspect(blockReason)} raw finish reason`,
        finish.finishReason.raw,
        undefined,
      );
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

    check(
      `${adapter} split finish reason`,
      split.finish.finishReason.unified,
      'stop',
    );
    check(
      `${adapter} split prompt feedback`,
      split.metadata?.promptFeedback,
      feedback,
    );
    check(
      `${adapter} split raw usage metadata`,
      split.metadata?.usageMetadata,
      finalUsage,
    );
    check(
      `${adapter} split normalized output usage`,
      split.finish.usage.outputTokens.total,
      3,
    );

    const blocked = await run(adapter, [
      { promptFeedback: { blockReason: 'SAFETY' } },
      { candidates: [candidate] },
      {
        promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' },
        usageMetadata: usage,
      },
    ]);

    check(
      `${adapter} confirmed block finish reason`,
      blocked.finish.finishReason,
      { unified: 'content-filter', raw: 'SAFETY' },
    );
    check(
      `${adapter} confirmed block prompt feedback`,
      blocked.metadata?.promptFeedback,
      { blockReason: 'SAFETY' },
    );
    check(
      `${adapter} text emitted after confirmed block`,
      blocked.parts.filter(part => part.type === 'text-delta'),
      [],
    );
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'ISSUE_20759_REPRODUCED: Google streaming loses cross-chunk feedback/metadata or reverses a confirmed prompt block',
        ...failures.map(failure => `- ${failure}`),
      ].join('\n'),
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
