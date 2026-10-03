import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV4Source } from '@ai-sdk/provider';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

const failureSignal =
  'ISSUE #9254: web-search sources and citations are conflated in AI SDK result.sources';

async function readFixture(relativePath: string) {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), 'utf8'),
  ) as any;
}

function fixtureFetch(body: unknown) {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

function sourceUrls(sources: LanguageModelV4Source[]) {
  return sources
    .filter(
      (
        source,
      ): source is Extract<LanguageModelV4Source, { sourceType: 'url' }> =>
        source.sourceType === 'url',
    )
    .map(source => source.url);
}

function assertSameUrls(actual: string[], expected: string[]) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);

  return (
    actual.length === expected.length &&
    actualSet.size === expectedSet.size &&
    [...expectedSet].every(url => actualSet.has(url))
  );
}

async function main() {
  const openaiFixture = await readFixture(
    '../../../../packages/openai/src/responses/__fixtures__/openai-web-search-tool.1.json',
  );
  const openai = createOpenAI({ fetch: fixtureFetch(openaiFixture) });
  const openaiResult = await generateText({
    model: openai.responses('gpt-5-nano'),
    prompt: 'What is the latest news?',
    tools: {
      webSearch: openai.tools.webSearch(),
    },
  });

  const openaiVisitedUrls = openaiFixture.output
    .filter(
      (part: any) =>
        part.type === 'web_search_call' && part.action?.type === 'search',
    )
    .flatMap((part: any) => part.action.sources ?? [])
    .filter((source: any) => source.type === 'url')
    .map((source: any) => source.url as string);
  const openaiCitationUrls = openaiFixture.output
    .filter((part: any) => part.type === 'message')
    .flatMap((part: any) => part.content)
    .flatMap((part: any) => part.annotations ?? [])
    .filter((annotation: any) => annotation.type === 'url_citation')
    .map((annotation: any) => annotation.url as string);

  const anthropicFixture = await readFixture(
    '../../../../packages/anthropic/src/__fixtures__/anthropic-web-search-tool.1.json',
  );
  const anthropic = createAnthropic({ fetch: fixtureFetch(anthropicFixture) });
  const anthropicResult = await generateText({
    model: anthropic('claude-3-haiku-20240307'),
    prompt: 'What is the latest news?',
    tools: {
      webSearch: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
    },
  });

  const anthropicVisitedUrls = anthropicFixture.content
    .filter(
      (part: any) =>
        part.type === 'web_search_tool_result' && Array.isArray(part.content),
    )
    .flatMap((part: any) => part.content)
    .map((source: any) => source.url as string);
  const anthropicCitationUrls = anthropicFixture.content
    .filter((part: any) => part.type === 'text')
    .flatMap((part: any) => part.citations ?? [])
    .filter((citation: any) => citation.type === 'web_search_result_location')
    .map((citation: any) => citation.url as string);

  if (
    openaiVisitedUrls.length <= openaiCitationUrls.length ||
    anthropicVisitedUrls.length <= anthropicCitationUrls.length
  ) {
    throw new Error(
      'Fixture precondition failed: sources must outnumber citations',
    );
  }

  const observed = {
    openai: {
      providerVisitedSources: openaiVisitedUrls.length,
      providerCitations: openaiCitationUrls.length,
      sdkSources: openaiResult.sources.length,
    },
    anthropic: {
      providerVisitedSources: anthropicVisitedUrls.length,
      providerCitations: anthropicCitationUrls.length,
      sdkSources: anthropicResult.sources.length,
    },
  };

  console.log(JSON.stringify(observed, null, 2));

  if (
    !assertSameUrls(sourceUrls(openaiResult.sources), openaiVisitedUrls) ||
    !assertSameUrls(sourceUrls(anthropicResult.sources), anthropicVisitedUrls)
  ) {
    throw new Error(failureSignal);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
