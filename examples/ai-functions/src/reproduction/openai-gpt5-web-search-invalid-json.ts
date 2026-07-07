import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { APICallError, generateText, stepCountIs } from 'ai';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const artifactDir = join(
  process.cwd(),
  'src/reproduction/artifacts/issue-11030',
);

async function writeArtifact(name: string, contents: string) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, name), contents);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

async function main() {
  const iterations = Number(process.env.REPRO_ITERATIONS ?? '5');
  const rawResponses: Array<{
    attempt: number;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  }> = [];

  let currentAttempt = 0;

  const openai = createOpenAI({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const body = await response.clone().text();
      const headers = headersToRecord(response.headers);

      rawResponses.push({
        attempt: currentAttempt,
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      });

      await writeArtifact(
        `attempt-${currentAttempt}-raw-response.txt`,
        [
          `status: ${response.status} ${response.statusText}`,
          `headers: ${JSON.stringify(headers, null, 2)}`,
          '',
          body,
        ].join('\n'),
      );

      return response;
    },
  });

  for (let attempt = 1; attempt <= iterations; attempt++) {
    currentAttempt = attempt;

    console.log(
      `\n========== ATTEMPT ${attempt} of ${iterations} ==========\n`,
    );

    try {
      const result = await generateText({
        model: openai.responses('gpt-5-mini'),
        prompt:
          'What happened in tech news today? Use web search, open a few relevant pages, and search for a key word pattern "vercel" on those pages. Reply with a concise summary and cite the pages you found.',
        tools: {
          web_search: openai.tools.webSearch({
            searchContextSize: 'high',
          }),
        },
        providerOptions: {
          openai: {
            reasoningEffort: 'high',
          } satisfies OpenAILanguageModelResponsesOptions,
        },
        stopWhen: stepCountIs(5),
        onStepFinish({ request, response }) {
          console.log('--- REQUEST ---');
          console.log(JSON.stringify(request, null, 2));
          console.log('--- RESPONSE BODY ---');
          console.log(JSON.stringify(response.body, null, 2));
        },
      });

      console.log(`attempt ${attempt} completed`);
      console.log(`text length: ${result.text.length}`);
      console.log(`tool calls: ${result.toolCalls.length}`);
    } catch (error) {
      console.error(`attempt ${attempt} failed`);

      if (APICallError.isInstance(error)) {
        const cause = asRecord(error.cause);
        const causeName = cause?.name;
        const causeMessage = cause?.message;

        console.error(
          JSON.stringify(
            {
              name: error.name,
              message: error.message,
              statusCode: error.statusCode,
              responseHeaders: error.responseHeaders,
              responseBodyPrefix: error.responseBody?.slice(0, 1000),
              causeName,
              causeMessage,
            },
            null,
            2,
          ),
        );

        await writeArtifact(
          `attempt-${attempt}-api-call-error.json`,
          JSON.stringify(
            {
              name: error.name,
              message: error.message,
              statusCode: error.statusCode,
              responseHeaders: error.responseHeaders,
              responseBody: error.responseBody,
              causeName,
              causeMessage,
              requestBodyValues: error.requestBodyValues,
            },
            null,
            2,
          ),
        );

        if (error.message === 'Invalid JSON response') {
          throw error;
        }
      }

      throw error;
    }
  }

  await writeArtifact(
    'summary.json',
    JSON.stringify(
      {
        attempts: iterations,
        rawResponseCount: rawResponses.length,
        rawResponses: rawResponses.map(response => ({
          attempt: response.attempt,
          status: response.status,
          statusText: response.statusText,
          bodyPrefix: response.body.slice(0, 500),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
