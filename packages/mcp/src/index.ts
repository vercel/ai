export { validateJSONRPCMessage } from './tool/json-rpc-message';
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
export type { ManagedMCPClient as Experimental_ManagedMCPClient } from './tool/mcp-client';
export type {
  MCPEventsAdapter as Experimental_MCPEventsAdapter,
  MCPEventsAdapterProvider as Experimental_MCPEventsAdapterProvider,
  ManagedSubscribeInput as Experimental_ManagedSubscribeInput,
  ManagedSubscription as Experimental_ManagedSubscription,
  ManagedMCPEvents as Experimental_ManagedMCPEvents,
} from './tool/mcp-events-adapter';
export {
  createMCPEventWebhook as experimental_createMCPEventWebhook,
  type MCPEventWebhookOptions as Experimental_MCPEventWebhookOptions,
} from './tool/mcp-event-webhook';
export type {
  MCPEvent as Experimental_MCPEvent,
  MCPEventControl as Experimental_MCPEventControl,
  MCPEventDefinition as Experimental_MCPEventDefinition,
  MCPEventStore as Experimental_MCPEventStore,
  MCPEventSubscription as Experimental_MCPEventSubscription,
  MCPEventSubscriptionInfo as Experimental_MCPEventSubscriptionInfo,
  MCPEvents as Experimental_MCPEvents,
  MCPEventsConfig as Experimental_MCPEventsConfig,
  ListEventsResult as Experimental_ListEventsResult,
  SubscribeEventOptions as Experimental_SubscribeEventOptions,
  SubscribeEventResult as Experimental_SubscribeEventResult,
} from './tool/mcp-event-types';
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
