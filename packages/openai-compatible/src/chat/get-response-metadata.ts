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
    // Some OpenAI-compatible providers use 0 as a placeholder timestamp.
    created: created || undefined,
  });
}
