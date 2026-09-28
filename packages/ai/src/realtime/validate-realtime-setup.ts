import { z } from '../util/zod';
import type { RealtimeSetupResponse } from './realtime-types';

const setupSchema = z.object({
  token: z.string().refine(value => value.trim().length > 0),
  url: z.string().refine(value => {
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
  expiresAt: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  tools: z
    .array(
      z.object({
        type: z.literal('function'),
        name: z.string().min(1),
        description: z.string().optional(),
        parameters: z.record(z.string(), z.unknown()),
      }),
    )
    .optional(),
});

export function validateRealtimeSetup(payload: unknown): RealtimeSetupResponse {
  const result = setupSchema.safeParse(payload);
  if (!result.success)
    throw new Error(
      'Invalid realtime setup: expected a nonempty token, a ws(s) URL, and valid optional expiresAt/tools',
    );
  return result.data;
}
