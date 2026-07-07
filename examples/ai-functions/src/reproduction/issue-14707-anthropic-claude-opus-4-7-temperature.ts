import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';

const fixtureUrl = new URL(
  '../../../../packages/anthropic/src/__fixtures__/issue-14707-claude-opus-4-7-temperature-live.json',
  import.meta.url,
);

async function main() {
  let requestBody: unknown;
  let responseFixture:
    | {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: unknown;
      }
    | undefined;

  function extractFixtureHeaders(headers: Headers) {
    const fixtureHeaders: Record<string, string> = {};

    headers.forEach((value, name) => {
      if (['content-type', 'request-id'].includes(name.toLowerCase())) {
        fixtureHeaders[name] = value;
      }
    });

    return fixtureHeaders;
  }

  const anthropic = createAnthropic({
    fetch: async (input, init) => {
      requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;

      const response = await fetch(input, init);
      const bodyText = await response.clone().text();

      responseFixture = {
        status: response.status,
        statusText: response.statusText,
        headers: extractFixtureHeaders(response.headers),
        body: bodyText.length > 0 ? JSON.parse(bodyText) : null,
      };

      return response;
    },
  });

  let result: unknown;
  try {
    const generation = await generateText({
      model: anthropic('claude-opus-4-7'),
      prompt: 'Reply with exactly OK.',
      maxOutputTokens: 16,
      temperature: 0.7,
    });

    result = {
      ok: true,
      text: generation.text,
      warnings: generation.warnings,
      usage: generation.usage,
    };
  } catch (error) {
    result = {
      ok: false,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : error,
    };
  }

  const fixture = {
    issue: 14707,
    model: 'claude-opus-4-7',
    inputTemperature: 0.7,
    requestBody,
    response: responseFixture,
    result,
  };

  await mkdir(new URL('.', fixtureUrl), { recursive: true });
  await writeFile(fixtureUrl, `${JSON.stringify(fixture, null, 2)}\n`);

  console.log(JSON.stringify(fixture, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
