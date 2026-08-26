import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { APICallError, type LanguageModelV4Prompt } from '@ai-sdk/provider';
import { isProviderStreamError } from '@ai-sdk/provider-utils';
import fs from 'node:fs/promises';

const prompt: LanguageModelV4Prompt = [
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
  const metadataFailures: string[] = [];

  const http = await captureHttpError('moonshotai-error-with-code.json');
  if (http.error.message !== http.expected.error.message) {
    metadataFailures.push('HTTP human-readable message was not preserved');
  }
  if (JSON.stringify(http.error.data) !== JSON.stringify(http.expected)) {
    metadataFailures.push(
      `HTTP APICallError.data dropped metadata: ${JSON.stringify(http.error.data)}`,
    );
  }

  const chunk = await readFixture('moonshotai-error-with-code.chunks.txt');
  const expectedStreamError = JSON.parse(chunk);
  const streamProvider = createFixtureProvider({
    body: `data: ${chunk}\n\ndata: [DONE]\n\n`,
    status: 200,
    contentType: 'text/event-stream',
  });
  const streamResult = await streamProvider
    .chatModel('kimi-k3')
    .doStream({ prompt });
  let streamError: unknown;
  const reader = streamResult.stream.getReader();
  while (true) {
    const { done, value: part } = await reader.read();
    if (done) {
      break;
    }
    if (part.type === 'error') {
      streamError = part.error;
      break;
    }
  }
  reader.releaseLock();

  if (!isProviderStreamError(streamError)) {
    throw new Error('Expected a structured Moonshot provider stream error');
  }
  if (streamError.message !== expectedStreamError.error.message) {
    metadataFailures.push('SSE human-readable message was not preserved');
  }
  if (streamError.type !== expectedStreamError.error.type) {
    metadataFailures.push('SSE error type was not preserved');
  }
  if (streamError.code !== expectedStreamError.error.code) {
    metadataFailures.push(
      `SSE error code was dropped: ${JSON.stringify(streamError.code)}`,
    );
  }
  if (
    JSON.stringify(streamError.data) !== JSON.stringify(expectedStreamError)
  ) {
    metadataFailures.push(
      `SSE structured data dropped metadata: ${JSON.stringify(streamError.data)}`,
    );
  }

  for (const filename of [
    'moonshotai-error-with-null-code.json',
    'moonshotai-error-message-only.json',
  ]) {
    const { error, expected } = await captureHttpError(filename);
    if (
      error.message !== expected.error.message ||
      JSON.stringify(error.data) !== JSON.stringify(expected)
    ) {
      metadataFailures.push(`${filename} did not retain its error envelope`);
    }
  }

  if (metadataFailures.length > 0) {
    console.error(
      'ISSUE #19552 REPRODUCED: Moonshot API error metadata was dropped',
    );
    for (const failure of metadataFailures) {
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
