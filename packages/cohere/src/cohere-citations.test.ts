import { describe, expect, it } from 'vitest';
import {
  cohereCitationSchema,
  mapCohereCitationToSource,
  type CohereCitation,
} from './cohere-citations';

const generateId = () => 'generated-id';

describe('cohereCitationSchema', () => {
  it('should accept a citation without optional fields', () => {
    expect(cohereCitationSchema.parse({})).toStrictEqual({});
  });

  it('should accept a source without a document', () => {
    expect(
      cohereCitationSchema.parse({
        sources: [
          { type: 'tool', id: 'getWeather:0', tool_output: { sunny: true } },
        ],
      }),
    ).toStrictEqual({
      sources: [
        { type: 'tool', id: 'getWeather:0', tool_output: { sunny: true } },
      ],
    });
  });
});

describe('mapCohereCitationToSource', () => {
  it('should map a document citation to a document source', () => {
    const result = mapCohereCitationToSource(
      {
        start: 1,
        end: 5,
        text: 'sunny',
        type: 'TEXT_CONTENT',
        sources: [
          {
            type: 'document',
            id: 'doc:0',
            document: {
              id: 'doc:0',
              text: 'It is sunny.',
              title: 'weather.txt',
            },
          },
        ],
      },
      generateId,
    );

    expect(result).toStrictEqual({
      type: 'source',
      sourceType: 'document',
      id: 'generated-id',
      mediaType: 'text/plain',
      title: 'weather.txt',
      providerMetadata: {
        cohere: {
          start: 1,
          end: 5,
          text: 'sunny',
          sources: [
            {
              type: 'document',
              id: 'doc:0',
              document: {
                id: 'doc:0',
                text: 'It is sunny.',
                title: 'weather.txt',
              },
            },
          ],
          citationType: 'TEXT_CONTENT',
        },
      },
    });
  });

  it('should use the first source with a document', () => {
    const citation: CohereCitation = {
      sources: [
        { type: 'tool', id: 'getWeather:0', tool_output: {} },
        { type: 'document', document: { title: 'second.txt' } },
        { type: 'document', document: { title: 'third.txt' } },
      ],
    };

    expect(mapCohereCitationToSource(citation, generateId)?.title).toBe(
      'second.txt',
    );
  });

  it.each([undefined, '', null])(
    'should fall back to "Document" for an empty title (%s)',
    title => {
      const citation: CohereCitation = {
        sources: [{ type: 'document', document: { title } }],
      };

      expect(mapCohereCitationToSource(citation, generateId)?.title).toBe(
        'Document',
      );
    },
  );

  it('should omit absent citation fields from the provider metadata', () => {
    const result = mapCohereCitationToSource(
      { sources: [{ document: { text: 'It is sunny.' } }] },
      generateId,
    );

    expect(result?.providerMetadata).toStrictEqual({
      cohere: {
        sources: [{ document: { text: 'It is sunny.' } }],
      },
    });
  });

  it('should not emit a source for tool-only citations', () => {
    const citation: CohereCitation = {
      start: 1,
      end: 5,
      text: 'sunny',
      sources: [
        { type: 'tool', id: 'getWeather:0', tool_output: { sunny: true } },
      ],
      type: 'TEXT_CONTENT',
    };

    expect(mapCohereCitationToSource(citation, generateId)).toBeUndefined();
  });

  it('should not emit a source for citations without sources', () => {
    expect(mapCohereCitationToSource({}, generateId)).toBeUndefined();
    expect(
      mapCohereCitationToSource({ sources: null }, generateId),
    ).toBeUndefined();
  });
});
