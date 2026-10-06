export { validateJSONRPCMessage } from './tool/json-rpc-message';
export { generateMCPWebhookSecret as experimental_generateMCPWebhookSecret } from './tool/mcp-events';
export type {
  MCPEvent as Experimental_MCPEvent,
  ListEventsResult as Experimental_ListEventsResult,
  SubscribeEventParams as Experimental_SubscribeEventParams,
  SubscribeEventResult as Experimental_SubscribeEventResult,
  UnsubscribeEventParams as Experimental_UnsubscribeEventParams,
} from './tool/mcp-events';
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
export {
  MCP_APP_MIME_TYPE,
  mcpAppClientCapabilities,
  readMCPAppResource,
  splitMCPAppTools,
  type MCPAppResource,
  type MCPAppResourceCSP,
  type MCPAppResourceMeta,
} from './tool/mcp-apps';
export {
  fingerprintMCPAppResource,
  detectMCPAppResourceDrift,
} from './tool/mcp-app-fingerprint';
export { ElicitationRequestSchema, ElicitResultSchema } from './tool/types';
export type {
  CallToolResult,
  CompleteRequestParams,
  CompleteResult,
  Configuration,
  ElicitationRequest,
  ElicitResult,
  InitializeResult,
  ListToolsResult,
  McpProviderMetadata,
  McpToolAnnotations,
  ClientCapabilities as MCPClientCapabilities,
} from './tool/types';
export { auth, UnauthorizedError } from './tool/oauth';
export {
  MCPClientOAuthError,
  AuthorizationServerMismatchError,
} from './error/oauth-error';
export { MCPClientError } from './error/mcp-client-error';
export type {
  OAuthAuthorizationServerInformation,
  OAuthClientProvider,
} from './tool/oauth';
export type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from './tool/oauth-types';
export type {
  MCPTransport,
  MCPTransportCloseOptions,
  MCPTransportSendOptions,
} from './tool/mcp-transport';

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
