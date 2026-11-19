import { z } from './zod';

export const gatewayWarningSchema = () =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('unsupported'),
      feature: z.string(),
      details: z.optional(z.string()),
    }),
    z.object({
      type: z.literal('compatibility'),
      feature: z.string(),
      details: z.optional(z.string()),
    }),
    z.object({
      type: z.literal('deprecated'),
      setting: z.string(),
      message: z.string(),
    }),
    z.object({
      type: z.literal('other'),
      message: z.string(),
    }),
  ]);
