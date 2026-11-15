import type { JSONArray, LanguageModelV4Source } from '@ai-sdk/provider';
import { z } from 'zod/v4';

/**
 * Citation payload Cohere returns for text content, in non-streaming responses
 * and in `citation-start` stream events.
 *
 * All fields are optional in the API specification, and a source can reference
 * either a document or tool output, so partial citations are validated instead
 * of discarding the whole response.
 */
export const cohereCitationSchema = z.object({
  start: z.number().nullish(),
  end: z.number().nullish(),
  text: z.string().nullish(),
  sources: z
    .array(
      z.object({
        type: z.string().nullish(),
        id: z.string().nullish(),
        // Documents are arbitrary objects; only the fields the provider maps
        // are typed, everything else is passed through as provider metadata.
        document: z
          .looseObject({
            id: z.string().nullish(),
            text: z.string().nullish(),
            title: z.string().nullish(),
          })
          .nullish(),
        tool_output: z.looseObject({}).nullish(),
      }),
    )
    .nullish(),
  type: z.string().nullish(),
});

export type CohereCitation = z.infer<typeof cohereCitationSchema>;

/**
 * Maps a Cohere citation to a document source.
 *
 * The first source with a document provides the title; all sources are kept in
 * `providerMetadata`. Citations that only reference tool output have no
 * document to point at and return `undefined` (their data stays in the response
 * body).
 */
export function mapCohereCitationToSource(
  citation: CohereCitation,
  generateId: () => string,
): LanguageModelV4Source | undefined {
  const document = citation.sources?.find(
    source => source.document != null,
  )?.document;

  if (document == null) {
    return undefined;
  }

  return {
    type: 'source',
    sourceType: 'document',
    id: generateId(),
    mediaType: 'text/plain',
    title: document.title || 'Document',
    providerMetadata: {
      cohere: {
        ...(citation.start != null && { start: citation.start }),
        ...(citation.end != null && { end: citation.end }),
        ...(citation.text != null && { text: citation.text }),
        ...(citation.sources != null && {
          sources: citation.sources as JSONArray,
        }),
        ...(citation.type != null && { citationType: citation.type }),
      },
    },
  };
}
