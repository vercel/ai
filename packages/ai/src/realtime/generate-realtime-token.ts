import { RealtimeModel } from '../types/realtime-model';

/**
 * Server-side helper that creates an ephemeral client secret for
 * authenticating browser-side WebSocket connections to a realtime model.
 *
 * Use this in your token endpoint route handler.
 *
 * @example
 * ```ts
 * import { generateRealtimeToken } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * export async function POST() {
 *   const result = await generateRealtimeToken({
 *     model: openai.realtime('gpt-4o-realtime'),
 *   });
 *   return Response.json(result);
 * }
 * ```
 */
export async function generateRealtimeToken({
  model,
  expiresAfterSeconds,
}: {
  model: RealtimeModel;
  expiresAfterSeconds?: number;
}): Promise<{
  token: string;
  url: string;
  expiresAt?: number;
}> {
  const result = await model.doCreateClientSecret({
    expiresAfterSeconds,
  });

  return {
    token: result.token,
    url: result.url,
    expiresAt: result.expiresAt,
  };
}
