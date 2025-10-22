'use client';

import { TextUIPart } from 'ai';
import { z } from 'zod/v4';
import { openaiResponsesTextUIPartProviderMetadataSchema } from '@ai-sdk/openai';
import { azureResponsesTextUIPartProviderMetadataSchema } from '@ai-sdk/azure';
import { Response } from '@/components/ai-elements/response';

// union of each providers
const responsesTextUIPartProviderMetadataSchema = z.union([
  openaiResponsesTextUIPartProviderMetadataSchema,
  azureResponsesTextUIPartProviderMetadataSchema,
]);

export function MessageTextWithAnnotations({ part }: { part: TextUIPart }) {
  if (!part.providerMetadata) return <Response>{part.text}</Response>;

  const providerMetadataParsed =
    responsesTextUIPartProviderMetadataSchema.safeParse(part.providerMetadata);

  if (!providerMetadataParsed.success) return <Response>{part.text}</Response>;

  const [provider, annotations] =
    'openai' in providerMetadataParsed.data
      ? ['openai' as const, providerMetadataParsed.data.openai.annotations]
      : ['azure' as const, providerMetadataParsed.data.azure.annotations];

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const text = annotations.reduce<string>((acc, cur) => {
    const text = (() => {
      switch (cur.type) {
        case 'container_file_citation':
          if (cur.start_index === 0 && cur.end_index === 0) return acc;
          return (
            acc.slice(0, cur.start_index) +
            `${baseUrl}/api/code-execution-files/${provider}/${cur.container_id}/${cur.file_id}` +
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
