export type {
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
} from './tool/json-rpc-message';

// Stable exports
export {
  createMCPClient,
  type MCPClientConfig,
  type MCPClient,
} from './tool/mcp-client';
export { ElicitationRequestSchema, ElicitResultSchema } from './tool/types';
export type {
  ElicitationRequest,
  ElicitResult,
  ClientCapabilities as MCPClientCapabilities,
} from './tool/types';
export { auth, UnauthorizedError } from './tool/oauth';
export type { OAuthClientProvider } from './tool/oauth';
export type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from './tool/oauth-types';
export type { MCPTransport } from './tool/mcp-transport';

/**
 * @deprecated Use `createMCPClient` instead. Will be removed in a future version.
 */
export { createMCPClient as experimental_createMCPClient } from './tool/mcp-client';

/**
 * @deprecated Use `MCPClientConfig` instead. Will be removed in a future version.
 */
export type { MCPClientConfig as experimental_MCPClientConfig } from './tool/mcp-client';

/**
 * @deprecated Use `MCPClient` instead. Will be removed in a future version.
 */
export type { MCPClient as experimental_MCPClient } from './tool/mcp-client';

/**
 * @deprecated Use `MCPClientCapabilities` instead. Will be removed in a future version.
 */
export type { ClientCapabilities as experimental_MCPClientCapabilities } from './tool/types';
