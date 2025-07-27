export type {
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
} from './mcp/json-rpc-message';
export { createMCPClient as experimental_createMCPClient } from './mcp/mcp-client';
export type { MCPTransport } from './mcp/mcp-transport';

// re-exports from provider-utils
export {
  tool,
  type Tool,
  type ToolCallOptions,
  type ToolExecuteFunction,
  type InferToolInput,
  type InferToolOutput,
} from '@ai-sdk/provider-utils';
