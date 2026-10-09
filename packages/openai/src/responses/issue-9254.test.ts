import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOpenAI } from '../openai-provider';

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
        'src/responses/__fixtures__/issue-9254-live-openai.json',
        'utf8',
      ),
    );
    const sourceUrls = fixture.output
      .filter((item: JsonObject) => item.type === 'web_search_call')
      .flatMap((item: JsonObject) => item.action?.sources ?? [])
      .map((source: JsonObject) => source.url);
    const citationUrls = fixture.output
      .filter((item: JsonObject) => item.type === 'message')
      .flatMap((item: JsonObject) => item.content ?? [])
      .flatMap((item: JsonObject) => item.annotations ?? [])
      .filter((annotation: JsonObject) => annotation.type === 'url_citation')
      .map((annotation: JsonObject) => annotation.url);

    const openai = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async () =>
        new Response(JSON.stringify(fixture), {
          headers: { 'content-type': 'application/json' },
        }),
    });
    const result = await openai.responses('gpt-5-nano').doGenerate({
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
    const content = result.content as Array<JsonObject>;

    expect(normalizedUrls(content, 'source')).toEqual(uniqueSorted(sourceUrls));
    expect(normalizedUrls(content, 'citation')).toEqual(
      uniqueSorted(citationUrls),
    );
  });
});
