import { createOpenAICompatibleResponseMetadata } from '@ai-sdk/provider-utils';

export function getResponseMetadata({
  id,
  model,
  created,
  created_at,
}: {
  id?: string | undefined | null;
  created?: number | undefined | null;
  created_at?: number | undefined | null;
  model?: string | undefined | null;
}) {
  return createOpenAICompatibleResponseMetadata({
    id,
    model,
    created: created ?? created_at,
  });
}
