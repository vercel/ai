'use client';

import { Response } from '@/components/ai-elements/response';
import { openaiResponsesOutputTextProviderMetadataSchema } from '@ai-sdk/openai';
import { azureResponsesOutputTextProviderMetadataSchema } from '@ai-sdk/azure';
import { TextUIPart } from 'ai';
import { z } from 'zod/v4';

const responsesOutputTextProviderMetadataSchema = z.union([
  openaiResponsesOutputTextProviderMetadataSchema,
  azureResponsesOutputTextProviderMetadataSchema,
]);

function extractProviderAndAnnotations(
  data: z.infer<typeof responsesOutputTextProviderMetadataSchema>,
) {
  if ('openai' in data) {
    return {
      provider: 'openai',
      itemId: data.openai.itemId,
      annotations: data.openai.annotations,
    } as const;
  }
  if ('azure' in data) {
    return {
      provider: 'azure',
      itemId: data.azure.itemId,
      annotations: data.azure.annotations,
    } as const;
  }
  // never
  const _exhaustive: never = data;
  return _exhaustive;
}

export function OpenaiResponsesText({ part }: { part: TextUIPart }) {
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
        case 'container_file_citation':
          if (cur.start_index === 0 && cur.end_index === 0) return acc;
          return (
            acc.slice(0, cur.start_index) +
            `${baseUrl}/api/download-container-file/${provider}?container_id=${encodeURIComponent(cur.container_id)}&file_id=${encodeURIComponent(cur.file_id)}&filename=${encodeURIComponent(cur.filename)}` +
            acc.slice(cur.end_index)
          );
        default:
          return acc;
      }
    })();
    return text;
  }, part.text);

  return <Response>{text}</Response>;
}
