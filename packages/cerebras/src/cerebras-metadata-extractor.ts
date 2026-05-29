import type { MetadataExtractor } from '@ai-sdk/openai-compatible';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const cerebrasMetadataExtractor: MetadataExtractor = {
  extractMetadata: async ({ parsedBody }) => {
    const parsed = await safeValidateTypes({
      value: parsedBody,
      schema: cerebrasServiceTierSchema,
    });

    if (!parsed.success) {
      return undefined;
    }

    const serviceTier = parsed.value.service_tier_used ?? undefined;

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

function getServiceTier(value: unknown): string | undefined {
  const parsed = cerebrasServiceTierSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data.service_tier_used ?? undefined;
}

const cerebrasServiceTierSchema = z.looseObject({
  // Cerebras returns the effective tier as `service_tier_used` (documented for
  // the `auto` tier).
  service_tier_used: z.string().nullish(),
});
