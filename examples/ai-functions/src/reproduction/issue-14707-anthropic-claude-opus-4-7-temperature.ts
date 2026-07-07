import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const fixturePath = path.join(
  repoRoot,
  'packages/anthropic/src/__fixtures__/issue-14707-claude-opus-4-7-temperature-live.json',
);

function redactHeaders(headers: Headers) {
  const recordedHeaders = new Set([
    'anthropic-version',
    'authorization',
    'content-type',
    'date',
    'request-id',
    'user-agent',
    'x-api-key',
  ]);
  const redactedHeaders = new Set(['authorization', 'x-api-key']);
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    if (!recordedHeaders.has(key.toLowerCase())) {
      return;
    }

    result[key] = redactedHeaders.has(key.toLowerCase()) ? '[redacted]' : value;
  });

  return result;
}

async function readRequestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === 'string') {
    return init.body;
  }

  if (input instanceof Request) {
    return await input.clone().text();
  }
}

async function main() {
  const calls: Array<{
    request: {
      url: string;
      method?: string;
      headers: Record<string, string>;
      body?: unknown;
    };
    response?: {
      status: number;
      headers: Record<string, string>;
      body: unknown;
    };
  }> = [];

  const anthropic = createAnthropic({
    fetch: async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const requestBodyText = await readRequestBody(input, init);
      const call: (typeof calls)[number] = {
        request: {
          url: request.url,
          method: request.method,
          headers: redactHeaders(request.headers),
          body:
            requestBodyText == null ? undefined : JSON.parse(requestBodyText),
        },
      };
      calls.push(call);

      const response = await fetch(input, init);
      const responseText = await response.clone().text();
      call.response = {
        status: response.status,
        headers: redactHeaders(response.headers),
        body: responseText.length > 0 ? JSON.parse(responseText) : null,
      };

      return response;
    },
  });

  const result = await generateText({
    model: anthropic('claude-opus-4-7'),
    prompt: 'Reply exactly with OK.',
    maxOutputTokens: 5,
    temperature: 0.7,
  });

  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(
    fixturePath,
    `${JSON.stringify(
      {
        model: 'claude-opus-4-7',
        inputTemperature: 0.7,
        text: result.text,
        warnings: result.warnings,
        calls,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        text: result.text,
        warnings: result.warnings,
        requestBody: calls[0]?.request.body,
        responseStatus: calls[0]?.response?.status,
        fixturePath: path.relative(repoRoot, fixturePath),
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
