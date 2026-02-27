// re-exports:
export { createGateway, gateway, type GatewayModelId } from '@ai-sdk/gateway';
export {
  asSchema,
  createIdGenerator,
  dynamicTool,
  generateId,
  jsonSchema,
  parseJsonEventStream,
  tool,
  zodSchema,
  type FlexibleSchema,
  type IdGenerator,
  type InferSchema,
  type InferToolInput,
  type InferToolOutput,
  type Schema,
  type Tool,
  type ToolApprovalRequest,
  type ToolApprovalResponse,
  type ToolCallOptions,
  type ToolExecutionOptions,
  type ToolExecuteFunction,
} from '@ai-sdk/provider-utils';

// directory exports
export * from './agent';
export * from './embed';
export * from './error';
export * from './generate-image';
export * from './generate-object';
export * from './generate-speech';
export * from './generate-text';
export * from './generate-video';
export * from './logger';
export * from './middleware';
export * from './prompt';
export * from './registry';
export * from './rerank';
export * from './text-stream';
export * from './transcribe';
export * from './types';
export * from './ui';
export * from './ui-message-stream';
export * from './util';

// telemetry types:
export type { TelemetrySettings } from './telemetry/telemetry-settings';
export type { TelemetryIntegration } from './telemetry/telemetry-integration';
export {
  expandIntegrations,
  bindTelemetryIntegration,
  type ExpandedTelemetryListeners,
} from './telemetry/expand-integrations';
export { registerTelemetryIntegration } from './telemetry/telemetry-integration-registry';

// import globals
import './global';
