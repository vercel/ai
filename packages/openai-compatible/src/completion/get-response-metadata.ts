import { createLanguageModelResponseMetadata } from '@ai-sdk/provider-utils';

export function getResponseMetadata({
  id,
  model,
  created,
}: {
  id?: string | null;
  model?: string | null;
  created?: number | null;
}) {
  return createLanguageModelResponseMetadata({
    id,
    model,
    created: created || undefined,
  });
}
