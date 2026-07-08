import {
  harnessV1BridgeHelloSchema,
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeReadySchema,
  harnessV1BridgeSandboxLogSchema,
} from "@ai-sdk/harness";
import { z } from "zod/v4";

export const acpRpcLineSchema = z.object({
  type: z.literal("rpc-line"),
  line: z.string(),
  seq: z.number().optional(),
});

export const acpOutboundMessageSchema = z.discriminatedUnion("type", [
  harnessV1BridgeHelloSchema,
  harnessV1BridgeSandboxLogSchema,
  acpRpcLineSchema,
  z.object({
    type: z.literal("error"),
    error: z.unknown(),
  }),
]);

export type AcpOutboundMessage = z.infer<typeof acpOutboundMessageSchema>;

export const acpRpcSendSchema = z.object({
  type: z.literal("rpc-send"),
  line: z.string(),
});

export const acpInboundMessageSchema = z.discriminatedUnion("type", [
  acpRpcSendSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);

export type AcpInboundMessage = z.infer<typeof acpInboundMessageSchema>;

export const acpBridgeReadySchema = harnessV1BridgeReadySchema;
export type AcpBridgeReady = z.infer<typeof acpBridgeReadySchema>;

export const acpBridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
});

export type AcpBridgeCoords = z.infer<typeof acpBridgeCoordsSchema>;