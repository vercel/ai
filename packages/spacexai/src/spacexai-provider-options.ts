import {
  NoSuchProviderReferenceError,
  type JSONObject,
  type SharedV4ProviderOptions,
  type SharedV4ProviderReference,
} from '@ai-sdk/provider';
import {
  parseProviderOptions,
  type FlexibleSchema,
} from '@ai-sdk/provider-utils';

export const SPACEXAI_PROVIDER = 'spacexai';
export const XAI_PROVIDER_ALIAS = 'xai';

/**
 * Prefer `providerOptions.spacexai`; fall back to the legacy
 * `providerOptions.xai` key for backward compatibility.
 */
export async function parseSpaceXAIProviderOptions<OPTIONS>({
  providerOptions,
  schema,
}: {
  providerOptions: Record<string, unknown> | undefined;
  schema: FlexibleSchema<OPTIONS>;
}): Promise<OPTIONS | undefined> {
  return (
    (await parseProviderOptions({
      provider: SPACEXAI_PROVIDER,
      providerOptions,
      schema,
    })) ??
    (await parseProviderOptions({
      provider: XAI_PROVIDER_ALIAS,
      providerOptions,
      schema,
    }))
  );
}

/**
 * Emit both `spacexai` and `xai` keys with the same payload so callers that
 * still read the legacy key keep working.
 */
export function spacexaiProviderMetadata<T extends JSONObject>(
  payload: T,
): { spacexai: T; xai: T } {
  return { spacexai: payload, xai: payload };
}

export function spacexaiProviderReference(id: string): {
  spacexai: string;
  xai: string;
} {
  return { spacexai: id, xai: id };
}

export function getSpaceXAIPartOptions(
  providerOptions: SharedV4ProviderOptions | undefined,
): JSONObject | undefined {
  return (
    providerOptions?.[SPACEXAI_PROVIDER] ??
    providerOptions?.[XAI_PROVIDER_ALIAS]
  );
}

export function resolveSpaceXAIProviderReference(
  reference: SharedV4ProviderReference,
): string {
  const id = reference[SPACEXAI_PROVIDER] ?? reference[XAI_PROVIDER_ALIAS];
  if (id != null) {
    return id;
  }

  throw new NoSuchProviderReferenceError({
    provider: SPACEXAI_PROVIDER,
    reference,
  });
}
