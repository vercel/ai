import type { LanguageModelV4Citation } from '@ai-sdk/provider';
import type { Citation } from './anthropic-api';

export type CitationDocument = {
  title: string;
  filename?: string;
  mediaType: string;
};

export function mapAnthropicCitation(
  citation: Citation,
  documents: Array<CitationDocument>,
): LanguageModelV4Citation {
  if (
    citation.type === 'web_search_result_location' ||
    citation.type === 'search_result_location'
  ) {
    const url =
      citation.type === 'web_search_result_location'
        ? citation.url
        : citation.source;
    return {
      source: {
        type: 'source',
        sourceType: 'url',
        id: url,
        url,
        title: citation.title ?? undefined,
        providerMetadata: { anthropic: { ...citation } },
      },
      citedText: citation.cited_text,
    };
  }

  const document = documents[citation.document_index];
  return {
    source: {
      type: 'source',
      sourceType: 'document',
      id: citation.file_id ?? String(citation.document_index),
      mediaType: document?.mediaType ?? 'text/plain',
      title:
        citation.document_title ??
        document?.title ??
        `Document ${citation.document_index}`,
      filename: document?.filename,
      providerMetadata: { anthropic: { ...citation } },
    },
    citedText: citation.cited_text,
  };
}
