import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

type WebSearch20250305Args = {
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  userLocation?: {
    type: 'approximate';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
};

export const webSearch_20250305ArgsSchema = z.object({
  maxUses: z.number().optional(),
  allowedDomains: z.array(z.string()).optional(),
  blockedDomains: z.array(z.string()).optional(),
  userLocation: z
    .object({
      type: z.literal('approximate'),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
});

export function webSearch_20250305(options: WebSearch20250305Args = {}) {
  return tool({
    type: 'provider-defined',
    id: 'anthropic.web_search_20250305',
    args: {
      maxUses: options.maxUses,
      allowedDomains: options.allowedDomains,
      blockedDomains: options.blockedDomains,
      userLocation: options.userLocation,
    },
    inputSchema: z.object({
      query: z.string(),
    }),
    outputSchema: z.array(
      z.object({
        url: z.string(),
        title: z.string(),
        pageAge: z.string().nullable(),
        encryptedContent: z.string(),
        type: z.string(),
      }),
    ),
  });
}
