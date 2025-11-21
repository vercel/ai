'use client';

import { Response } from '@/components/ai-elements/response';
import { TextUIPart } from 'ai';
import { z } from 'zod/v4';

export const openaiResponsesTextUIPartProviderMetadataSchema = z.object({
  openai: z.object({
    itemId: z.string(),
    annotations: z
      .array(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('url_citation'),
            url: z.string(),
            title: z.string(),
            start_index: z.number(),
            end_index: z.number(),
          }),
          z.object({
            type: z.literal('file_citation'),
            file_id: z.string(),
            filename: z.string(),
            index: z.number(),
            quote: z.string().nullish(),
          }),
          z.object({
            type: z.literal('container_file_citation'),
            container_id: z.string(),
            file_id: z.string(),
            filename: z.string(),
            start_index: z.number(),
            end_index: z.number(),
          }),
        ]),
      )
      .optional(),
  }),
});

export function OpenaiResponsesText({ part }: { part: TextUIPart }) {
  if (!part.providerMetadata) return <Response>{part.text}</Response>;

  const providerMetadataParsed =
    openaiResponsesTextUIPartProviderMetadataSchema.safeParse(
      part.providerMetadata,
    );

  if (!providerMetadataParsed.success) return <Response>{part.text}</Response>;

  const { annotations } = providerMetadataParsed.data.openai;
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
            `${baseUrl}/api/download-container-file?container_id=${encodeURIComponent(cur.container_id)}&file_id=${encodeURIComponent(cur.file_id)}&filename=${encodeURIComponent(cur.filename)}` +
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
