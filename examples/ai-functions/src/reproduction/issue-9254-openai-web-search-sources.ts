import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

type WebSearchFixture = {
  model: string;
  output: Array<{
    type: string;
    action?: {
      sources?: Array<
        { type: 'url'; url: string } | { type: string; [key: string]: unknown }
      >;
    };
    content?: Array<{
      annotations?: Array<
        | { type: 'url_citation'; url: string }
        | { type: string; [key: string]: unknown }
      >;
    }>;
    [key: string]: unknown;
  }>;
};

function normalizeUrl(value: string) {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

async function main() {
  const fixtureUrl = new URL(
    '../../../../packages/openai/src/responses/__fixtures__/openai-web-search-tool.1.json',
    import.meta.url,
  );
  const fixture = JSON.parse(
    await readFile(fixtureUrl, 'utf8'),
  ) as WebSearchFixture;

  const openai = createOpenAI({
    apiKey: 'fixture-api-key',
    fetch: async () =>
      new Response(JSON.stringify(fixture), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
  });

  const result = await generateText({
    model: openai.responses(fixture.model),
    prompt: 'What happened in tech news today?',
    tools: {
      web_search: openai.tools.webSearch(),
    },
  });

  const providerSourceUrls = new Set(
    fixture.output
      .filter(part => part.type === 'web_search_call')
      .flatMap(part => part.action?.sources ?? [])
      .filter(
        (source): source is { type: 'url'; url: string } =>
          source.type === 'url',
      )
      .map(source => normalizeUrl(source.url)),
  );

  const providerCitationUrls = new Set(
    fixture.output
      .filter(part => part.type === 'message')
      .flatMap(part => part.content ?? [])
      .flatMap(part => part.annotations ?? [])
      .filter(
        (annotation): annotation is { type: 'url_citation'; url: string } =>
          annotation.type === 'url_citation',
      )
      .map(annotation => normalizeUrl(annotation.url)),
  );

  const sdkSourceUrls = new Set(
    result.sources
      .filter(source => source.sourceType === 'url')
      .map(source => normalizeUrl(source.url)),
  );

  if (providerSourceUrls.size <= providerCitationUrls.size) {
    throw new Error(
      'Fixture does not contain more visited sources than inline citations.',
    );
  }

  const missingProviderSources = [...providerSourceUrls].filter(
    url => !sdkSourceUrls.has(url),
  );

  console.log(
    JSON.stringify(
      {
        providerSourceCount: providerSourceUrls.size,
        providerCitationCount: providerCitationUrls.size,
        sdkSourceCount: sdkSourceUrls.size,
        missingProviderSourceCount: missingProviderSources.length,
      },
      null,
      2,
    ),
  );

  if (missingProviderSources.length > 0) {
    console.error(
      `ISSUE #9254: AI SDK omitted ${missingProviderSources.length} of ${providerSourceUrls.size} OpenAI web-search sources from result.sources.`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
