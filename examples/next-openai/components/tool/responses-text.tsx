'use client';

import { Response } from '@/components/ai-elements/response';
import type { OpenaiResponsesTextProviderMetadata } from '@ai-sdk/openai';
import type { AzureResponsesTextProviderMetadata } from '@ai-sdk/azure';
import { TextUIPart } from 'ai';
import { z } from 'zod/v4';

const responsesOutputTextProviderMetadataSchema = z.custom<
  OpenaiResponsesTextProviderMetadata | AzureResponsesTextProviderMetadata
>();

function extractProviderAndAnnotations(
  providerMetadata: z.infer<typeof responsesOutputTextProviderMetadataSchema>,
) {
  if ('openai' in providerMetadata) {
    return {
      provider: 'openai',
      itemId: providerMetadata.openai.itemId,
      annotations: providerMetadata.openai.annotations,
    } as const;
  }
  if ('azure' in providerMetadata) {
    return {
      provider: 'azure',
      itemId: providerMetadata.azure.itemId,
      annotations: providerMetadata.azure.annotations,
    } as const;
  }
  // never
  const _exhaustive: never = providerMetadata;
  return _exhaustive;
}

export function ResponsesText({ part }: { part: TextUIPart }) {
  if (!part.providerMetadata) return <Response>{part.text}</Response>;

  const providerMetadataParsed =
    responsesOutputTextProviderMetadataSchema.safeParse(part.providerMetadata);

  if (!providerMetadataParsed.success) return <Response>{part.text}</Response>;

  const {
    provider, // 'openai' or 'azure'
    itemId: _,
    annotations,
  } = extractProviderAndAnnotations(providerMetadataParsed.data);

  if (!annotations) return <Response>{part.text}</Response>;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Sort annotations by start_index in descending order to process from end to start.
  // This ensures that string modifications don't invalidate indices of earlier annotations.
  const sortedAnnotations = [...annotations].sort((a, b) => {
    const aStart = 'start_index' in a ? a.start_index : -1;
    const bStart = 'start_index' in b ? b.start_index : -1;
    return bStart - aStart;
  });

  const text = sortedAnnotations.reduce<string>((acc, cur) => {
    const text = (() => {
      switch (cur.type) {
        case 'url_citation': {
          if (cur.start_index === 0 && cur.end_index === 0) return acc;
          const targetText = acc.slice(cur.start_index, cur.end_index);

          // Markdown URL Link format
          const markdownLink = `[${targetText}](${cur.url}${cur.title ? ` "${cur.title}"` : ''})`;

          return (
            acc.slice(0, cur.start_index) +
            markdownLink +
            acc.slice(cur.end_index)
          );
        }
        case 'file_citation': {
          return acc;
        }
        case 'container_file_citation': {
          if (cur.start_index === 0 && cur.end_index === 0) return acc;
          return (
            acc.slice(0, cur.start_index) +
            `${baseUrl}/api/download-container-file/${provider}?container_id=${encodeURIComponent(cur.container_id)}&file_id=${encodeURIComponent(cur.file_id)}&filename=${encodeURIComponent(cur.filename)}` +
            acc.slice(cur.end_index)
          );
        }
        case 'file_path': {
          // unknown usecase
          return acc;
        }
        default: {
          const _exhaustive: never = cur;
          return _exhaustive;
        }
      }
    })();
    return text;
  }, part.text);

  return <Response>{text}</Response>;
}
