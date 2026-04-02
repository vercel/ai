'use client';

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect, useState, useCallback } from 'react';

interface PendingApproval {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export default function Chat() {
  const { status, sendMessage, messages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    [],
  );
  const [resolvedToolCallIds, setResolvedToolCallIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingApprovals]);

  // Detect paused tools: tool-* parts without output after streaming ends
  useEffect(() => {
    if (status !== 'ready') return;

    const newApprovals: PendingApproval[] = [];
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts) {
        const p = part as any;
        if (
          p.type?.startsWith('tool-') &&
          p.state !== 'output-available' &&
          p.toolCallId &&
          !resolvedToolCallIds.has(p.toolCallId)
        ) {
          newApprovals.push({
            toolCallId: p.toolCallId,
            toolName: p.type.replace('tool-', ''),
            input: p.input,
          });
        }
      }
    }

    if (newApprovals.length > 0) {
      setPendingApprovals(prev => {
        const existing = new Set(prev.map(a => a.toolCallId));
        const fresh = newApprovals.filter(a => !existing.has(a.toolCallId));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    }
  }, [status, messages, resolvedToolCallIds]);

  const handleApproval = useCallback(
    async (approval: PendingApproval, approved: boolean) => {
      // Remove from pending and mark as resolved
      setPendingApprovals(prev =>
        prev.filter(a => a.toolCallId !== approval.toolCallId),
      );
      setResolvedToolCallIds(prev => new Set([...prev, approval.toolCallId]));

      if (approved) {
        sendMessage({
          text: `Approved. Go ahead and execute ${approval.toolName}.`,
        });
      } else {
        sendMessage({
          text: `Denied. Do not execute ${approval.toolName}.`,
        });
      }
    },
    [sendMessage],
  );

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="p-4 border-b">
        <h1 className="text-lg font-semibold">WorkflowAgent Chat</h1>
        <p className="text-sm text-gray-500">
          A workflow AI agent with weather, calculator, and file tools
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {message.parts.map((part, index) => {
                const p = part as any;
                if (part.type === 'text') {
                  return (
                    <div key={index} className="whitespace-pre-wrap">
                      {part.text}
                    </div>
                  );
                }
                if (p.type?.startsWith('tool-') && p.toolCallId) {
                  const toolName = p.type.replace('tool-', '');
                  const isPending = pendingApprovals.some(
                    a => a.toolCallId === p.toolCallId,
                  );
                  const isResolved = resolvedToolCallIds.has(p.toolCallId);
                  return (
                    <div
                      key={index}
                      className="my-2 p-2 bg-white/50 rounded text-sm border"
                    >
                      <div className="font-mono text-xs text-gray-500">
                        {toolName}
                        {isPending && (
                          <span className="ml-2 text-amber-600">
                            (awaiting approval)
                          </span>
                        )}
                        {isResolved && p.state !== 'output-available' && (
                          <span className="ml-2 text-gray-400">(resolved)</span>
                        )}
                      </div>
                      {p.state === 'output-available' && (
                        <pre className="mt-1 text-xs overflow-x-auto">
                          {JSON.stringify(p.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {/* Pending approval cards */}
        {pendingApprovals.map(approval => (
          <div key={approval.toolCallId} className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-3 bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-600 text-lg">&#9888;</span>
                <span className="font-semibold text-amber-800">
                  Approval Required
                </span>
              </div>
              <p className="text-sm text-gray-700 mb-1">
                The assistant wants to use{' '}
                <code className="bg-amber-100 px-1 rounded font-semibold">
                  {approval.toolName}
                </code>
              </p>
              <pre className="text-xs bg-white rounded p-2 mb-3 border overflow-x-auto">
                {JSON.stringify(approval.input, null, 2)}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApproval(approval, true)}
                  className="rounded-lg bg-green-500 px-4 py-1.5 text-sm text-white hover:bg-green-600 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleApproval(approval, false)}
                  className="rounded-lg bg-red-500 px-4 py-1.5 text-sm text-white hover:bg-red-600 transition-colors"
                >
                  Deny
                </button>
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <form
        className="p-4 border-t flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            'message',
          ) as HTMLInputElement;
          if (input.value.trim()) {
            sendMessage({ text: input.value });
            input.value = '';
            setPendingApprovals([]);
            setResolvedToolCallIds(new Set());
          }
        }}
      >
        <input
          name="message"
          type="text"
          placeholder="Ask about weather, math, or file operations..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={status === 'streaming' || status === 'submitted'}
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          disabled={status === 'streaming' || status === 'submitted'}
        >
          Send
        </button>
      </form>
    </div>
  );
}
