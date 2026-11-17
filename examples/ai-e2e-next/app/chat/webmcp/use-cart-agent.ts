'use client';

import { createMCPClient, WebMCPTransport, type MCPClient } from '@ai-sdk/mcp';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCartSnapshot,
  initialCart,
  registerCartTools,
  setCartQuantity,
  type Cart,
  type PageModelContext,
  type ProductId,
} from './cart-tools';

export function useCartAgent() {
  const [cart, setCart] = useState(initialCart);
  const cartRef = useRef(cart);
  const client = useRef<MCPClient>();
  const [ready, setReady] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  // Update the ref synchronously so consecutive tools see the latest cart.
  const writeCart = useCallback((next: Cart) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat/webmcp',
      async prepareSendMessagesRequest({ messages }) {
        const { tools } = await client.current!.listTools();
        console.log('[WebMCP] Discovered tools sent to the server', tools);
        console.log('[WebMCP] MCP client after discovery', client.current);
        return { body: { messages, tools } };
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (!toolCall.dynamic) return;
      console.log('[WebMCP] Tool call received', toolCall);
      try {
        const output = await client.current!.callTool({
          name: toolCall.toolName,
          arguments: toolCall.input as Record<string, unknown>,
        });
        console.log('[WebMCP] Tool result', {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output,
        });
        // Do not await addToolOutput inside onToolCall.
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        });
      } catch (error) {
        console.error('[WebMCP] Tool call failed', error);
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  useEffect(() => {
    const modelContext = (
      document as Document & { modelContext?: PageModelContext }
    ).modelContext;
    if (!modelContext?.getTools || !modelContext.executeTool) {
      setSetupError(
        'Enable WebMCP testing at chrome://flags/#enable-webmcp-testing, relaunch Chrome, and reload.',
      );
      return;
    }
    const registration = new AbortController();
    let mcpClient: MCPClient | undefined;
    async function connect() {
      await registerCartTools(
        modelContext!,
        () => cartRef.current,
        writeCart,
        registration.signal,
      );
      if (registration.signal.aborted) return;
      mcpClient = await createMCPClient({
        transport: new WebMCPTransport({ modelContext: modelContext! }),
      });
      if (registration.signal.aborted) {
        await mcpClient.close();
        return;
      }
      client.current = mcpClient;
      console.log('[WebMCP] MCP client stored', mcpClient);
      setReady(true);
    }
    connect().catch(error => {
      if (!registration.signal.aborted) {
        setSetupError(error instanceof Error ? error.message : String(error));
        registration.abort();
      }
    });
    return () => {
      registration.abort();
      if (client.current === mcpClient) client.current = undefined;
      void mcpClient?.close();
    };
  }, [writeCart]);

  return {
    cart: getCartSnapshot(cart),
    setQuantity: (id: ProductId, quantity: number) =>
      writeCart(setCartQuantity(cartRef.current, id, quantity)),
    messages,
    sendMessage,
    status,
    error,
    ready,
    setupError,
  };
}
