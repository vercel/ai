import {
  APICallError,
  type LanguageModelV2Prompt,
} from '../../../../packages/provider/src/index';
import { createMoonshotAI } from '../../../../packages/moonshotai/src/index';
import fs from 'node:fs/promises';

const prompt: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

async function readFixture(filename: string) {
  return (
    await fs.readFile(
      new URL(
        `../../../../packages/moonshotai/src/__fixtures__/${filename}`,
        import.meta.url,
      ),
      'utf8',
    )
  ).trim();
}

function createFixtureProvider({
  body,
  status,
  contentType,
}: {
  body: string;
  status: number;
  contentType: string;
}) {
  return createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(body, {
        status,
        headers: { 'content-type': contentType },
      }),
  });
}

async function captureHttpError(filename: string) {
  const body = await readFixture(filename);
  const expected = JSON.parse(body);
  const provider = createFixtureProvider({
    body,
    status: 400,
    contentType: 'application/json',
  });

  try {
    await provider.chatModel('kimi-k3').doGenerate({ prompt });
  } catch (error) {
    if (!APICallError.isInstance(error)) {
      throw error;
    }
    return { error, expected };
  }

  throw new Error('Expected Moonshot HTTP request to fail');
}

async function main() {
  const failures: string[] = [];

  const http = await captureHttpError('moonshotai-error-with-code.json');
  if (http.error.message !== http.expected.error.message) {
    failures.push('HTTP human-readable message was not preserved');
  }
  if (JSON.stringify(http.error.data) !== JSON.stringify(http.expected)) {
    failures.push(
      `HTTP APICallError.data dropped metadata: ${JSON.stringify(http.error.data)}`,
    );
  }

  const chunk = await readFixture('moonshotai-error-with-code.chunks.txt');
  const expectedStreamError = JSON.parse(chunk).error;
  const streamProvider = createFixtureProvider({
    body: `data: ${chunk}\n\ndata: [DONE]\n\n`,
    status: 200,
    contentType: 'text/event-stream',
  });
  const streamResult = await streamProvider
    .chatModel('kimi-k3')
    .doStream({ prompt });
  let streamError: unknown;

  for await (const part of streamResult.stream) {
    if (part.type === 'error') {
      streamError = part.error;
      break;
    }
  }

  if (JSON.stringify(streamError) !== JSON.stringify(expectedStreamError)) {
    failures.push(
      `SSE error part dropped structured diagnostics: ${JSON.stringify(streamError)}`,
    );
  }

  for (const filename of [
    'moonshotai-error-with-null-code.json',
    'moonshotai-error-message-only.json',
    'moonshotai-error-without-code-live.json',
  ]) {
    const { error, expected } = await captureHttpError(filename);
    if (
      error.message !== expected.error.message ||
      JSON.stringify(error.data) !== JSON.stringify(expected)
    ) {
      failures.push(`${filename} did not retain its error envelope`);
    }
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE #19552 REPRODUCED: Moonshot API error metadata was dropped',
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Moonshot API error metadata was preserved');
}

main().catch(error => {
  console.error('Moonshot error metadata reproduction harness failed');
  console.error(error);
  process.exitCode = 2;
});
