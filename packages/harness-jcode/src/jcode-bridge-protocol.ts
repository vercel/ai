import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';

export const jcodeBridgeOutboundMessageSchema =
  harnessV1BridgeOutboundMessageSchema;
export type JcodeBridgeOutboundMessage = z.infer<
  typeof jcodeBridgeOutboundMessageSchema
>;

export const jcodeBridgeStartMessageSchema =
  harnessV1BridgeStartBaseSchema.extend({
    operation: z.enum(['prompt', 'compact']).optional(),
    reasoningEffort: z.string().optional(),
    resumeSessionId: z.string().optional(),
  });
export type JcodeBridgeStartMessage = z.infer<
  typeof jcodeBridgeStartMessageSchema
>;

export const jcodeBridgeInboundMessageSchema = z.discriminatedUnion('type', [
  jcodeBridgeStartMessageSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);
export type JcodeBridgeInboundMessage = z.infer<
  typeof jcodeBridgeInboundMessageSchema
>;

export const jcodeBridgeReadySchema = harnessV1BridgeReadySchema;
