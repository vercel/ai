'use client';

import {
  createMCPClient,
  WebMCPTransport,
  type MCPClient,
  type WebMCPModelContext,
  type WebMCPTool,
} from '@ai-sdk/mcp';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import { useEffect, useRef, useState } from 'react';

// Local typing for the experimental browser API, without changing DOM globals.
type PageModelContext = WebMCPModelContext & {
  registerTool(
    tool: Omit<WebMCPTool, 'origin' | 'window'> & {
      execute: () => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ): Promise<void>;
};

export default function WebMCPChat() {
  const quantity = useRef<HTMLInputElement>(null);
  const client = useRef<MCPClient>();
  const [ready, setReady] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat/webmcp',
      async prepareSendMessagesRequest({ messages }) {
        // Only definitions travel to the server. The functions stay in this page.
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
        console.error('[WebMCP] Tool call failed', {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          error,
        });
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
      setSetupError('Open this example in a browser with WebMCP enabled.');
      return;
    }

    const registration = new AbortController();
    let mcpClient: MCPClient | undefined;
    async function connect() {
      await modelContext!.registerTool(
        {
          name: 'getCart',
          description: "Read the items in the user's current shopping cart",
          annotations: { readOnlyHint: true },
          execute: async () => ({
            items: [
              {
                name: 'T-shirt',
                quantity: quantity.current?.valueAsNumber ?? 0,
                unitPrice: 25,
                currency: 'USD',
              },
            ],
          }),
        },
        { signal: registration.signal },
      );
      if (registration.signal.aborted) return;
      console.log('[WebMCP] Browser tool registered', 'getCart');

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
      }
    });

    return () => {
      registration.abort();
      void mcpClient?.close();
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Shopping cart assistant</h1>
      <label>
        T-shirts ($25 each):{' '}
        <input
          ref={quantity}
          type="number"
          min={0}
          defaultValue={2}
          className="w-20 rounded border p-1"
        />
      </label>
      <p>Change the quantity, then ask the assistant to read your cart.</p>
      <button
        type="button"
        disabled={!ready || status === 'submitted' || status === 'streaming'}
        onClick={() =>
          sendMessage({ text: "What's in my cart, and what is the total?" })
        }
        className="rounded border p-2 disabled:opacity-50"
      >
        Ask about my cart
      </button>
      {setupError && <p role="alert">{setupError}</p>}
      {error && <p role="alert">{error.message}</p>}
      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          <strong>{message.role === 'user' ? 'You: ' : 'Assistant: '}</strong>
          {message.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join('')}
        </div>
      ))}
    </main>
  );
}
