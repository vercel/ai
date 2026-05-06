import type { DynamicToolUIPart, ToolUIPart, UITools } from 'ai';
import type { CSSProperties, ReactNode } from 'react';

export type MCPAppToolPart = ToolUIPart<UITools> | DynamicToolUIPart;

export type MCPAppDisplayMode = 'inline' | 'fullscreen' | 'pip';

export type MCPAppMetadata = {
  resourceUri: string;
  mimeType: 'text/html;profile=mcp-app';
  visibility?: Array<'model' | 'app'>;
};

export type MCPAppResourceCSP = {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  [key: string]: unknown;
};

export type MCPAppResourceMeta = {
  prefersBorder?: boolean;
  csp?: MCPAppResourceCSP;
  permissions?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MCPAppResource = {
  uri: string;
  mimeType: 'text/html;profile=mcp-app';
  html: string;
  meta?: MCPAppResourceMeta;
};

export type MCPAppHostContext = {
  theme?: 'light' | 'dark';
  displayMode?: MCPAppDisplayMode;
  availableDisplayModes?: MCPAppDisplayMode[];
  [key: string]: unknown;
};

export type MCPAppToolCallParams = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type MCPAppBridgeHandlers = {
  allowedTools?: string[];
  callTool?: (params: MCPAppToolCallParams) => Promise<unknown> | unknown;
  readResource?: (params: { uri: string }) => Promise<unknown> | unknown;
  listResources?: (params?: unknown) => Promise<unknown> | unknown;
  openLink?: (params: { url: string }) => Promise<unknown> | unknown;
  sendMessage?: (params: unknown) => Promise<unknown> | unknown;
  updateModelContext?: (params: unknown) => Promise<unknown> | unknown;
  requestDisplayMode?: (params: {
    mode: MCPAppDisplayMode;
  }) => Promise<{ mode: MCPAppDisplayMode }> | { mode: MCPAppDisplayMode };
  onSizeChange?: (params: { width?: number; height?: number }) => void;
  onInitialized?: () => void;
  onRequestTeardown?: (params: unknown) => void;
  onLog?: (params: unknown) => void;
  onError?: (error: Error) => void;
};

export type MCPAppSandboxConfig = {
  url: string | URL;
  title?: string;
  className?: string;
  style?: CSSProperties;
  targetOrigin?: string;
  outerSandbox?: string;
  innerSandbox?: string;
};

export type MCPAppFrameProps = {
  app: MCPAppMetadata;
  resource: MCPAppResource;
  input?: unknown;
  output?: unknown;
  sandbox: MCPAppSandboxConfig;
  handlers?: MCPAppBridgeHandlers;
  hostInfo?: { name: string; version: string };
  hostContext?: MCPAppHostContext;
};

export type MCPAppRendererProps = {
  part: MCPAppToolPart;
  sandbox: MCPAppSandboxConfig;
  resource?: MCPAppResource;
  loadResource?: (app: MCPAppMetadata) => Promise<MCPAppResource>;
  handlers?: MCPAppBridgeHandlers;
  hostInfo?: { name: string; version: string };
  hostContext?: MCPAppHostContext;
  fallback?: ReactNode;
};

export type MCPAppJsonRpcRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
};

export type MCPAppJsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

export type MCPAppJsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type MCPAppJsonRpcMessage =
  | MCPAppJsonRpcRequest
  | MCPAppJsonRpcNotification
  | MCPAppJsonRpcResponse;
