import * as acpV1BridgeProtocol from './v1/acp-v1-bridge-protocol';

export const outboundMessageSchema = acpV1BridgeProtocol.outboundMessageSchema;
export type OutboundMessage = acpV1BridgeProtocol.OutboundMessage;

export const startMessageSchema = acpV1BridgeProtocol.startMessageSchema;
export type StartMessage = acpV1BridgeProtocol.StartMessage;

export const inboundMessageSchema = acpV1BridgeProtocol.inboundMessageSchema;
export type InboundMessage = acpV1BridgeProtocol.InboundMessage;

export const bridgeReadySchema = acpV1BridgeProtocol.bridgeReadySchema;
export type BridgeReady = acpV1BridgeProtocol.BridgeReady;
