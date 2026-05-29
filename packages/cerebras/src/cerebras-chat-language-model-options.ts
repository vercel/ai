import { z } from 'zod/v4';

export type { CerebrasChatModelId } from './cerebras-chat-options';

export const cerebrasChatProviderOptions = z.object({
  /**
   * Controls the processing priority of the request.
   *
   * - `priority`: Highest priority (dedicated endpoints only).
   * - `default`: Standard priority processing (the API default).
   * - `auto`: Automatically uses the highest available service tier.
   * - `flex`: Lowest priority, processed towards the end.
   *
   * When using `auto`, the effective tier the request ran on is surfaced on
   * `providerMetadata.cerebras.serviceTier`.
   */
  serviceTier: z.enum(['auto', 'default', 'flex', 'priority']).optional(),

  /**
   * Maximum acceptable queue time, in milliseconds, for `flex`/`auto` requests.
   * If the expected queue time exceeds this threshold, the request is rejected
   * rather than waiting in the queue. Sent as the `queue_threshold` header.
   *
   * Valid range: 50-20000.
   */
  queueThreshold: z.number().int().min(50).max(20000).optional(),
});

export type CerebrasChatProviderOptions = z.infer<
  typeof cerebrasChatProviderOptions
>;
