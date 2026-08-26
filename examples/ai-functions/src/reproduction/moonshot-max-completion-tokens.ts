import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { generateText, streamText } from 'ai';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_OUTPUT_TOKENS = 17;
const FIXTURE_DIRECTORY = path.resolve(
  process.cwd(),
  '../../packages/moonshotai/src/__fixtures__',
);

type RequestBody = Record<string, unknown>;

async function createFixtureFetch(capturedBodies: RequestBody[]) {
  const jsonResponse = await fs.readFile(
    path.join(FIXTURE_DIRECTORY, 'moonshotai-max-completion-tokens.json'),
    'utf8',
  );
  const streamResponse = (
    await fs.readFile(
      path.join(
        FIXTURE_DIRECTORY,
        'moonshotai-max-completion-tokens.chunks.txt',
      ),
      'utf8',
    )
  )
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`)
    .concat('data: [DONE]\n\n')
    .join('');

  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as RequestBody;
    capturedBodies.push(body);

    return body.stream === true
      ? new Response(streamResponse, {
          headers: { 'content-type': 'text/event-stream' },
        })
      : new Response(jsonResponse, {
          headers: { 'content-type': 'application/json' },
        });
  };
}

function verifyRequest({
  body,
  label,
  expectedMaxOutputTokens,
}: {
  body: RequestBody;
  label: string;
  expectedMaxOutputTokens: number | undefined;
}) {
  if (expectedMaxOutputTokens == null) {
    return 'max_completion_tokens' in body || 'max_tokens' in body
      ? `${label} included a max-token field for undefined maxOutputTokens`
      : undefined;
  }

  const sendsReplacement =
    body.max_completion_tokens === expectedMaxOutputTokens;
  const omitsDeprecated = !('max_tokens' in body);

  return sendsReplacement && omitsDeprecated
    ? undefined
    : `${label} sent ${JSON.stringify({
        max_completion_tokens: body.max_completion_tokens,
        max_tokens: body.max_tokens,
      })}`;
}

async function main() {
  const capturedBodies: RequestBody[] = [];
  const provider = createMoonshotAI({
    apiKey: 'fixture-api-key',
    fetch: await createFixtureFetch(capturedBodies),
  });
  const model = provider('kimi-k3');

  await generateText({
    model,
    prompt: 'Reply with OK.',
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  const definedStream = streamText({
    model,
    prompt: 'Reply with OK.',
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  await definedStream.consumeStream();

  await generateText({
    model,
    prompt: 'Reply with OK.',
  });

  const undefinedStream = streamText({
    model,
    prompt: 'Reply with OK.',
  });
  await undefinedStream.consumeStream();

  if (capturedBodies.length !== 4) {
    throw new Error(
      `Expected four Moonshot requests, received ${capturedBodies.length}.`,
    );
  }

  const failures = [
    verifyRequest({
      body: capturedBodies[0],
      label: 'non-streaming request',
      expectedMaxOutputTokens: MAX_OUTPUT_TOKENS,
    }),
    verifyRequest({
      body: capturedBodies[1],
      label: 'streaming request',
      expectedMaxOutputTokens: MAX_OUTPUT_TOKENS,
    }),
    verifyRequest({
      body: capturedBodies[2],
      label: 'non-streaming undefined request',
      expectedMaxOutputTokens: undefined,
    }),
    verifyRequest({
      body: capturedBodies[3],
      label: 'streaming undefined request',
      expectedMaxOutputTokens: undefined,
    }),
  ].filter((failure): failure is string => failure != null);

  if (failures.length > 0) {
    throw new Error(
      `ISSUE #19556: Moonshot requests did not serialize maxOutputTokens as only max_completion_tokens. ${failures.join(
        '; ',
      )}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
