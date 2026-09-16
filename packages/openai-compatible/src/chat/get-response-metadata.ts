<<<<<<< HEAD
=======
import { createLanguageModelResponseMetadata } from '@ai-sdk/provider-utils';

>>>>>>> 11b4c2daaa (fix(openai-compatible): extract streaming response metadata after pla… (#20837))
export function getResponseMetadata({
  id,
  model,
  created,
}: {
<<<<<<< HEAD
  id?: string | undefined | null;
  created?: number | undefined | null;
  model?: string | undefined | null;
}) {
  return {
    id: id ?? undefined,
    modelId: model ?? undefined,
    timestamp: created != null ? new Date(created * 1000) : undefined,
  };
=======
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
>>>>>>> 11b4c2daaa (fix(openai-compatible): extract streaming response metadata after pla… (#20837))
}
