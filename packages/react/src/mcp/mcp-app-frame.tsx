import { useEffect, useMemo, useRef } from 'react';
import { MCPAppBridge } from './mcp-app-bridge';
import {
  MCP_APP_DEFAULT_INNER_SANDBOX,
  MCP_APP_DEFAULT_OUTER_SANDBOX,
  getMCPAppAllowAttribute,
  getMCPAppCSP,
} from './mcp-app-sandbox';
import type { MCPAppFrameProps } from './mcp-app-types';
import { normalizeMCPAppToolResult } from './normalize-mcp-app-tool-result';

export function MCPAppFrame({
  app,
  resource,
  input,
  output,
  sandbox,
  handlers,
  hostInfo,
  hostContext,
}: MCPAppFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<MCPAppBridge | undefined>(undefined);
  const inputRef = useRef(input);
  const outputRef = useRef(output);
  const initializedRef = useRef(false);
  inputRef.current = input;
  outputRef.current = output;
  const targetOrigin = sandbox.targetOrigin ?? '*';
  const sandboxUrl = useMemo(() => String(sandbox.url), [sandbox.url]);
  const bridgeHandlers = useMemo(
    () => ({
      ...handlers,
      onInitialized: () => {
        initializedRef.current = true;
        handlers?.onInitialized?.();
        if (inputRef.current !== undefined) {
          bridgeRef.current?.sendToolInput(inputRef.current);
        }
        if (outputRef.current !== undefined) {
          bridgeRef.current?.sendToolResult(
            normalizeMCPAppToolResult(outputRef.current),
          );
        }
      },
    }),
    [handlers],
  );
  const bridgeHandlersRef = useRef(bridgeHandlers);
  bridgeHandlersRef.current = bridgeHandlers;

  useEffect(() => {
    const iframe = iframeRef.current;
    const targetWindow = iframe?.contentWindow;
    if (targetWindow == null) {
      return;
    }

    initializedRef.current = false;

    const bridge = new MCPAppBridge({
      targetWindow,
      targetOrigin,
      handlers: bridgeHandlersRef.current,
      hostInfo,
      hostContext,
    });
    bridgeRef.current = bridge;

    const onMessage = (event: MessageEvent) => {
      if (
        event.source === targetWindow &&
        event.data?.jsonrpc === '2.0' &&
        event.data.method === 'ui/notifications/sandbox-proxy-ready'
      ) {
        bridge.sendSandboxResourceReady({
          html: resource.html,
          csp: getMCPAppCSP(resource.meta?.csp),
          sandbox: sandbox.innerSandbox ?? MCP_APP_DEFAULT_INNER_SANDBOX,
          allow: getMCPAppAllowAttribute(resource.meta?.permissions),
          app,
        });
        return;
      }

      bridge.handleMessage(event);
    };

    window.addEventListener('message', onMessage);

    return () => {
      initializedRef.current = false;
      window.removeEventListener('message', onMessage);
      void bridge.teardownResource().catch(() => {});
      bridge.close();
      bridgeRef.current = undefined;
    };
  }, [
    app,
    hostContext,
    hostInfo,
    resource,
    sandbox.innerSandbox,
    sandboxUrl,
    targetOrigin,
  ]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    outputRef.current = output;
  }, [output]);

  useEffect(() => {
    bridgeRef.current?.setHandlers(bridgeHandlers);
  }, [bridgeHandlers]);

  useEffect(() => {
    if (hostContext != null) {
      bridgeRef.current?.setHostContext(hostContext);
    }
  }, [hostContext]);

  useEffect(() => {
    if (initializedRef.current && input !== undefined) {
      bridgeRef.current?.sendToolInput(input);
    }
  }, [input]);

  useEffect(() => {
    if (initializedRef.current && output !== undefined) {
      bridgeRef.current?.sendToolResult(normalizeMCPAppToolResult(output));
    }
  }, [output]);

  return (
    <iframe
      ref={iframeRef}
      title="MCP App"
      aria-label={sandbox.title ?? app.resourceUri}
      src={sandboxUrl}
      className={sandbox.className}
      style={sandbox.style}
      sandbox={sandbox.outerSandbox ?? MCP_APP_DEFAULT_OUTER_SANDBOX}
    />
  );
}
