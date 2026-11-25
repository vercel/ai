import {
  isRecord,
  safeParseJSON,
  type FetchFunction,
} from '@ai-sdk/provider-utils';

/**
 * Creates a fetch wrapper that sends an alias model ID to the provider while
 * retaining the canonical model ID for AI SDK capability checks.
 */
export function createModelIdAliasFetch({
  modelId,
  aliasModelId,
  fetch: customFetch,
}: {
  /** The model ID used to create the AI SDK model. */
  modelId: string;
  /** The model ID accepted by the provider's early-access API. */
  aliasModelId: string;
  /** An optional fetch implementation to wrap. Defaults to the global fetch. */
  fetch?: FetchFunction;
}): FetchFunction {
  const fetch = customFetch ?? globalThis.fetch;

  return async (input, init) => {
    // Direct Anthropic and OpenAI calls provide their JSON payload as init.body.
    // Leave other request shapes, including streams, untouched.
    if (typeof init?.body !== 'string') {
      return fetch(input, init);
    }

    const result = await safeParseJSON({ text: init.body });
    if (
      !result.success ||
      !isRecord(result.value) ||
      result.value.model !== modelId
    ) {
      return fetch(input, init);
    }

    return fetch(input, {
      ...init,
      body: JSON.stringify({ ...result.value, model: aliasModelId }),
    });
  };
}
