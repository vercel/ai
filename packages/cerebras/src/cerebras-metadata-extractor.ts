import type { MetadataExtractor } from '@ai-sdk/openai-compatible';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const cerebrasServiceTierSchema = z.looseObject({
  // Cerebras returns the effective tier as `service_tier_used` (documented for
  // the `auto` tier). Fall back to `service_tier` if echoed back.
  service_tier_used: z.string().nullish(),
  service_tier: z.string().nullish(),
});

function getServiceTier(value: unknown): string | undefined {
  const parsed = cerebrasServiceTierSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data.service_tier_used ?? parsed.data.service_tier ?? undefined;
}

/**
 * Surfaces the effective Cerebras service tier on
 * `providerMetadata.cerebras.serviceTier`, but only when the API returns it.
 */
export const cerebrasMetadataExtractor: MetadataExtractor = {
  extractMetadata: async ({ parsedBody }) => {
    const parsed = await safeValidateTypes({
      value: parsedBody,
      schema: cerebrasServiceTierSchema,
    });

    if (!parsed.success) {
      return undefined;
    }

    const serviceTier =
      parsed.value.service_tier_used ?? parsed.value.service_tier ?? undefined;

    return serviceTier != null ? { cerebras: { serviceTier } } : undefined;
  },

  createStreamExtractor: () => {
    let serviceTier: string | undefined;

    return {
      processChunk(parsedChunk) {
        serviceTier ??= getServiceTier(parsedChunk);
      },

      buildMetadata() {
        return serviceTier != null ? { cerebras: { serviceTier } } : undefined;
      },
    };
  },
};
