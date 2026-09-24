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
    // Azure content-filter chunks use 0 as a placeholder timestamp. Preserve
    // the previous OpenAI behavior so those chunks are not treated as metadata.
    created: created || undefined,
  });
}
