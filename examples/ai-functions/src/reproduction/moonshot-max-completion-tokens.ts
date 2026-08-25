import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { generateText, streamText } from 'ai';
import fs from 'node:fs';

type RequestBody = Record<string, unknown>;

const generateFixture = fs.readFileSync(
  new URL(
    '../../../../packages/moonshotai/src/__fixtures__/moonshotai-max-completion-tokens.json',
    import.meta.url,
  ),
  'utf8',
);

const streamFixture = fs.readFileSync(
  new URL(
    '../../../../packages/moonshotai/src/__fixtures__/moonshotai-max-completion-tokens.chunks.txt',
    import.meta.url,
  ),
  'utf8',
);

function createFixtureFetch(requestBodies: RequestBody[]) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as RequestBody;
    requestBodies.push(body);

    if (body.stream === true) {
      return new Response(streamFixture, {
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    return new Response(generateFixture, {
      headers: { 'content-type': 'application/json' },
    });
  };
}

function checkTokenLimit({
  body,
  label,
  expected,
  failures,
}: {
  body: RequestBody;
  label: string;
  expected: number | undefined;
  failures: string[];
}) {
  const hasDeprecatedKey = 'max_tokens' in body;
  const hasReplacementKey = 'max_completion_tokens' in body;

  if (expected === undefined) {
    if (hasDeprecatedKey || hasReplacementKey) {
      failures.push(`${label} included a max-token key for undefined`);
    }
    return;
  }

  if (
    hasDeprecatedKey ||
    !hasReplacementKey ||
    body.max_completion_tokens !== expected
  ) {
    const actual = hasDeprecatedKey
      ? `max_tokens=${String(body.max_tokens)}`
      : hasReplacementKey
        ? `max_completion_tokens=${String(body.max_completion_tokens)}`
        : 'no max-token key';

    failures.push(
      `${label} serialized maxOutputTokens as ${actual} instead of only max_completion_tokens=${expected}`,
    );
  }
}

async function main() {
  const requestBodies: RequestBody[] = [];
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: createFixtureFetch(requestBodies),
  });

  await generateText({
    model: provider('kimi-k3'),
    prompt: 'Reply with exactly OK.',
    maxOutputTokens: 17,
  });

  const streamWithLimit = streamText({
    model: provider('kimi-k3'),
    prompt: 'Reply with exactly OK.',
    maxOutputTokens: 17,
  });
  for await (const _part of streamWithLimit.fullStream) {
    // Consume the recorded live stream.
  }

  await generateText({
    model: provider('kimi-k3'),
    prompt: 'Reply with exactly OK.',
  });

  const streamWithoutLimit = streamText({
    model: provider('kimi-k3'),
    prompt: 'Reply with exactly OK.',
  });
  for await (const _part of streamWithoutLimit.fullStream) {
    // Consume the recorded live stream.
  }

  const failures: string[] = [];
  checkTokenLimit({
    body: requestBodies[0],
    label: 'non-streaming',
    expected: 17,
    failures,
  });
  checkTokenLimit({
    body: requestBodies[1],
    label: 'streaming',
    expected: 17,
    failures,
  });
  checkTokenLimit({
    body: requestBodies[2],
    label: 'non-streaming undefined',
    expected: undefined,
    failures,
  });
  checkTokenLimit({
    body: requestBodies[3],
    label: 'streaming undefined',
    expected: undefined,
    failures,
  });

  if (failures.length > 0) {
    throw new Error(
      `Moonshot request serialization bug: ${failures.join('; ')}`,
    );
  }

  console.log(
    'Moonshot requests use only max_completion_tokens and omit undefined values.',
  );
}

main();
