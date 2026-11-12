import { z } from '../util/zod';
import type { RealtimeSetupResponse } from './realtime-types';

const setupSchema = z.object({
  token: z.string().check(z.refine(value => value.trim().length > 0)),
  url: z.string().check(
    z.refine(value => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === 'ws:' || url.protocol === 'wss:') &&
          url.hostname !== ''
        );
      } catch {
        return false;
      }
    }),
  ),
  expiresAt: z.optional(
    z.number().check(z.positive()).check(z.maximum(Number.MAX_SAFE_INTEGER)),
  ),
  tools: z.optional(
    z.array(
      z.object({
        type: z.literal('function'),
        name: z.string().check(z.minLength(1)),
        description: z.optional(z.string()),
        parameters: z.record(z.string(), z.unknown()),
      }),
    ),
  ),
});

export function validateRealtimeSetup(payload: unknown): RealtimeSetupResponse {
  const result = setupSchema.safeParse(payload);
  if (!result.success)
    throw new Error(
      'Invalid realtime setup: expected a nonempty token, a ws(s) URL, and valid optional expiresAt/tools',
    );
  return result.data;
}
