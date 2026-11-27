'use client';

import {
  createMCPClient,
  Experimental_WebMCPTransport,
  type Experimental_WebMCPModelContext,
  type MCPClient,
} from '@ai-sdk/mcp';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import { useEffect, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';

const suggestion =
  'Find the Code Mode documentation and open the relevant page.';
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const DocsWebMCPChat = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<string>();
  const clientRef = useRef<MCPClient | null>(null);
  const stopped = useRef(false);
  const toolController = useRef(new AbortController());
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: '/api/webmcp-chat',
        prepareSendMessagesRequest: async ({ messages }) => {
          const client = clientRef.current;
          if (!client) throw new Error('WebMCP tools are not connected.');
          const { tools } = await client.listTools();
          return {
            body: { messages, tools, currentRoute: window.location.pathname },
          };
        },
      }),
  );
  const {
    messages,
    sendMessage,
    addToolOutput,
    status,
    error,
    stop,
    setMessages,
  } = useChat({
    transport,
    sendAutomaticallyWhen: state =>
      !stopped.current && lastAssistantMessageIsCompleteWithToolCalls(state),
    onToolCall: async ({ toolCall }) => {
      if (toolCall.providerExecuted) return;
      try {
        const client = clientRef.current;
        if (!client) throw new Error('WebMCP tools are not connected.');
        const output = await client.callTool({
          name: toolCall.toolName,
          arguments: toolCall.input as Record<string, unknown>,
          options: { signal: toolController.current.signal },
        });
        if (output.isError) {
          throw new Error(
            (Array.isArray(output.content)
              ? output.content
                  .flatMap(part =>
                    typeof part.text === 'string' ? [part.text] : [],
                  )
                  .join('\n')
              : '') || 'Browser tool failed.',
          );
        }
        void addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        });
      } catch (cause) {
        void addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: errorMessage(cause),
        });
      }
    },
  });
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    let disposed = false;
    let client: MCPClient | undefined;
    let refreshing = false;
    let refreshRequested = false;
    const context = (
      document as Document & {
        modelContext?: Experimental_WebMCPModelContext & EventTarget;
      }
    ).modelContext;
    const reportError = (cause: unknown) => {
      if (!disposed) setConnectionError(errorMessage(cause));
    };
    const refreshTools = async () => {
      refreshRequested = true;
      if (refreshing || !client) return;
      refreshing = true;
      try {
        do {
          refreshRequested = false;
          const { tools } = await client.listTools();
          if (disposed) return;
          if (!refreshRequested) {
            clientRef.current = client;
            setToolNames(tools.map(tool => tool.name));
            setConnectionError(undefined);
          }
        } while (refreshRequested);
      } finally {
        refreshing = false;
      }
    };
    const toolsChanged = () => {
      void refreshTools().catch(reportError);
    };
    context?.addEventListener('toolchange', toolsChanged);
    const connect = async () => {
      if (!context)
        throw new Error(
          'Native WebMCP is unavailable. Enable WebMCP in your browser and reload.',
        );
      client = await createMCPClient({
        transport: new Experimental_WebMCPTransport({
          modelContext: context,
        }),
      });
      if (disposed) {
        await client.close();
        return;
      }
      await refreshTools();
    };
    void connect().catch(reportError);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        setOpen(value => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', shortcut);
    return () => {
      disposed = true;
      stopped.current = true;
      clientRef.current = null;
      toolController.current.abort();
      void client?.close();
      context?.removeEventListener('toolchange', toolsChanged);
      window.removeEventListener('keydown', shortcut);
    };
  }, []);

  const send = (text: string) => {
    if (!text.trim() || busy || toolNames.length === 0) return;
    stopped.current = false;
    toolController.current = new AbortController();
    setInput('');
    void sendMessage({ text });
  };

  return (
    <>
      <button
        type="button"
        className="mr-6 shrink-0 rounded-md border px-3 py-1.5 text-sm"
        aria-expanded={open}
        aria-controls="webmcp-chat"
        onClick={() => setOpen(value => !value)}
      >
        Ask AI
      </button>
      <aside
        id="webmcp-chat"
        aria-label="Ask AI with WebMCP"
        hidden={!open}
        className={`fixed bottom-0 right-0 top-16 z-50 w-full max-w-md flex-col border bg-background-200 shadow-xl ${open ? 'flex' : 'hidden'}`}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-medium">Ask AI · WebMCP</h2>
            <p className="text-xs text-gray-900">Local browser agent</p>
          </div>
          <button
            type="button"
            aria-label="Close Ask AI"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
        <details className="border-b p-3 text-xs" open>
          <summary>
            {toolNames.length
              ? `${toolNames.length} browser tools connected`
              : 'Connecting browser tools…'}
          </summary>
          <ul className="mt-2 space-y-1 font-mono">
            {toolNames.map(name => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          {connectionError && <p role="alert">{connectionError}</p>}
        </details>
        <div
          role="log"
          aria-label="WebMCP conversation"
          aria-live="polite"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm"
        >
          {messages.length === 0 && (
            <button
              type="button"
              className="rounded-md border p-3 text-left disabled:opacity-50"
              disabled={!toolNames.length}
              onClick={() => send(suggestion)}
            >
              {suggestion}
            </button>
          )}
          {messages.map(message => (
            <div key={message.id} className="space-y-2">
              <p className="text-xs font-medium text-gray-900">
                {message.role === 'user' ? 'You' : 'Ask AI'}
              </p>
              {message.parts.map((part, index) => {
                if (part.type === 'text')
                  return <Streamdown key={index}>{part.text}</Streamdown>;
                if (!isToolUIPart(part)) return null;
                return (
                  <details
                    key={part.toolCallId}
                    className="rounded-md border p-2 text-xs"
                  >
                    <summary className="font-mono">
                      {getToolName(part)} · {part.state}
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(
                        {
                          input: part.input,
                          ...('output' in part ? { output: part.output } : {}),
                          ...('errorText' in part
                            ? { error: part.errorText }
                            : {}),
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                );
              })}
            </div>
          ))}
          {error && (
            <p role="alert" className="text-red-700">
              {error.message}
            </p>
          )}
        </div>
        <form
          className="space-y-2 border-t p-3"
          onSubmit={event => {
            event.preventDefault();
            send(input);
          }}
        >
          <label className="sr-only" htmlFor="webmcp-question">
            Ask about the docs
          </label>
          <textarea
            id="webmcp-question"
            className="w-full resize-none rounded-md border bg-transparent p-2"
            rows={2}
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Find a page, navigate, or read the docs…"
          />
          <div className="flex justify-between">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMessages([])}
            >
              Clear
            </button>
            {busy ? (
              <button
                type="button"
                onClick={() => {
                  stopped.current = true;
                  toolController.current.abort();
                  void stop();
                }}
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  !input.trim() || !toolNames.length || !!connectionError
                }
              >
                Send
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  );
};
