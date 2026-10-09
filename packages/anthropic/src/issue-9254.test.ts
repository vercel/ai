import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

type JsonObject = Record<string, any>;

function uniqueSorted(values: Array<string | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => value != null)),
  ].sort();
}

function normalizedUrls(
  content: Array<JsonObject>,
  category: 'source' | 'citation',
) {
  return uniqueSorted(
    content
      .filter(part => {
        const normalizedCategory =
          part.type === 'citation' || part.type === 'annotation'
            ? 'citation'
            : part.type === 'source'
              ? (part.category ??
                part.kind ??
                part.sourceRole ??
                part.sourcePurpose ??
                'source')
              : undefined;

        return category === 'citation'
          ? normalizedCategory === 'citation' ||
              normalizedCategory === 'annotation'
          : normalizedCategory === 'source' ||
              normalizedCategory === 'retrieved';
      })
      .map(part => part.url),
  );
}

describe('issue #9254', () => {
  it('distinguishes retrieved web-search sources from inline citations', async () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        'src/__fixtures__/issue-9254-live-anthropic.json',
        'utf8',
      ),
    );
    const sourceUrls = fixture.content
      .filter((item: JsonObject) => item.type === 'web_search_tool_result')
      .flatMap((item: JsonObject) =>
        Array.isArray(item.content) ? item.content : [],
      )
      .map((source: JsonObject) => source.url);
    const citationUrls = fixture.content
      .filter((item: JsonObject) => item.type === 'text')
      .flatMap((item: JsonObject) => item.citations ?? [])
      .filter(
        (citation: JsonObject) =>
          citation.type === 'web_search_result_location',
      )
      .map((citation: JsonObject) => citation.url);

    const anthropic = createAnthropic({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
      fetch: async () =>
        new Response(JSON.stringify(fixture), {
          headers: { 'content-type': 'application/json' },
        }),
    });
    const result = await anthropic('claude-sonnet-4-5').doGenerate({
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
    const content = result.content as Array<JsonObject>;

    expect(normalizedUrls(content, 'source')).toEqual(uniqueSorted(sourceUrls));
    expect(normalizedUrls(content, 'citation')).toEqual(
      uniqueSorted(citationUrls),
    );
  });
});
