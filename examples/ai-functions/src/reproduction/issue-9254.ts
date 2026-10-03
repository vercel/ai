import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type JsonObject = Record<string, any>;

const repositoryPath = (path: string) =>
  fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

async function readFixture(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(repositoryPath(path), 'utf8'));
}

function fixtureFetch(fixture: JsonObject) {
  return async () =>
    new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => value != null))];
}

function normalizedCategory(
  part: JsonObject,
): 'source' | 'citation' | undefined {
  const category =
    part.type === 'citation' || part.type === 'annotation'
      ? 'citation'
      : part.type === 'source'
        ? (part.category ??
          part.kind ??
          part.sourceRole ??
          part.sourcePurpose ??
          'source')
        : undefined;

  return category === 'citation' || category === 'annotation'
    ? 'citation'
    : category === 'source' || category === 'retrieved'
      ? 'source'
      : undefined;
}

function normalizedUrls(
  content: Array<JsonObject>,
  category: 'source' | 'citation',
) {
  return unique(
    content
      .filter(part => normalizedCategory(part) === category)
      .map(part => part.url),
  ).sort();
}

function assertDistinctNormalizedOutput({
  provider,
  content,
  expectedSourceUrls,
  expectedCitationUrls,
}: {
  provider: string;
  content: Array<JsonObject>;
  expectedSourceUrls: Array<string>;
  expectedCitationUrls: Array<string>;
}) {
  assert.deepEqual(
    normalizedUrls(content, 'source'),
    unique(expectedSourceUrls).sort(),
    `${provider} should expose every retrieved URL as a normalized source`,
  );
  assert.deepEqual(
    normalizedUrls(content, 'citation'),
    unique(expectedCitationUrls).sort(),
    `${provider} should expose inline citations separately from retrieved sources`,
  );
}

async function main() {
  const openaiFixture = await readFixture(
    'packages/openai/src/responses/__fixtures__/issue-9254-live-openai.json',
  );
  const anthropicFixture = await readFixture(
    'packages/anthropic/src/__fixtures__/issue-9254-live-anthropic.json',
  );

  const openaiSourceUrls = openaiFixture.output
    .filter((item: JsonObject) => item.type === 'web_search_call')
    .flatMap((item: JsonObject) => item.action?.sources ?? [])
    .map((source: JsonObject) => source.url);
  const openaiCitationUrls = openaiFixture.output
    .filter((item: JsonObject) => item.type === 'message')
    .flatMap((item: JsonObject) => item.content ?? [])
    .flatMap((item: JsonObject) => item.annotations ?? [])
    .filter((annotation: JsonObject) => annotation.type === 'url_citation')
    .map((annotation: JsonObject) => annotation.url);

  const openai = createOpenAI({
    apiKey: 'reproduction-key',
    fetch: fixtureFetch(openaiFixture),
  });
  const openaiResult = await openai.responses('gpt-5-nano').doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Search the web.' }],
      },
    ],
    tools: [
      {
        type: 'provider-defined',
        id: 'openai.web_search',
        name: 'web_search',
        args: {},
      },
    ],
  });

  const anthropicSourceUrls = anthropicFixture.content
    .filter((item: JsonObject) => item.type === 'web_search_tool_result')
    .flatMap((item: JsonObject) =>
      Array.isArray(item.content) ? item.content : [],
    )
    .map((source: JsonObject) => source.url);
  const anthropicCitationUrls = anthropicFixture.content
    .filter((item: JsonObject) => item.type === 'text')
    .flatMap((item: JsonObject) => item.citations ?? [])
    .filter(
      (citation: JsonObject) => citation.type === 'web_search_result_location',
    )
    .map((citation: JsonObject) => citation.url);

  const anthropic = createAnthropic({
    apiKey: 'reproduction-key',
    generateId: () => 'reproduction-id',
    fetch: fixtureFetch(anthropicFixture),
  });
  const anthropicResult = await anthropic('claude-sonnet-4-5').doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Search the web.' }],
      },
    ],
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.web_search_20250305',
        name: 'web_search',
        args: { maxUses: 2 },
      },
    ],
  });

  try {
    assert.ok(openaiSourceUrls.length > openaiCitationUrls.length);
    assert.ok(anthropicSourceUrls.length > anthropicCitationUrls.length);
    assertDistinctNormalizedOutput({
      provider: 'OpenAI',
      content: openaiResult.content as Array<JsonObject>,
      expectedSourceUrls: openaiSourceUrls,
      expectedCitationUrls: openaiCitationUrls,
    });
    assertDistinctNormalizedOutput({
      provider: 'Anthropic',
      content: anthropicResult.content as Array<JsonObject>,
      expectedSourceUrls: anthropicSourceUrls,
      expectedCitationUrls: anthropicCitationUrls,
    });
  } catch {
    throw new Error(
      'Issue #9254 reproduced: AI SDK does not expose web-search sources and citations as distinct normalized output categories.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
