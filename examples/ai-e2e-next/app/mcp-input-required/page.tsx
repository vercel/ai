'use client';

import {
  createMCPClient,
  ElicitationRequestSchema,
  type ElicitResult,
  type MCPClient,
} from '@ai-sdk/mcp';
import { useEffect, useRef, useState } from 'react';

export default function Page() {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [approval, setApproval] = useState<{
    message: string;
    resolve: (answer: ElicitResult) => void;
  } | null>(null);
  const abortController = useRef<AbortController>();

  useEffect(() => () => abortController.current?.abort(), []);

  async function deploy() {
    const controller = new AbortController();
    abortController.current = controller;
    setRunning(true);
    setOutput('');
    let client: MCPClient | undefined;
    try {
      client = await createMCPClient({
        transport: {
          type: 'http',
          url: new URL('/api/mcp-input-required', window.location.origin).href,
        },
        capabilities: { elicitation: { form: {} } },
        initializationOptions: { signal: controller.signal },
      });
      client.onElicitationRequest(
        ElicitationRequestSchema,
        request =>
          new Promise(resolve =>
            setApproval({ message: request.params.message, resolve }),
          ),
      );
      const result = await client.callTool({
        name: 'deploy',
        options: { signal: controller.signal },
      });
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      setOutput(error instanceof Error ? error.message : String(error));
    } finally {
      await client?.close();
      setApproval(null);
      setRunning(false);
    }
  }

  function answer(action: ElicitResult['action']) {
    approval?.resolve({
      action,
      ...(action === 'accept' ? { content: { confirmed: true } } : {}),
    });
    setApproval(null);
  }

  return (
    <main className="max-w-xl mx-auto p-8 space-y-4">
      <h1 className="text-xl font-semibold">MCP tool confirmation</h1>
      <p>
        Call a demo tool, then answer the server’s confirmation request. No API
        key is needed and nothing is deployed.
      </p>
      <button
        type="button"
        disabled={running}
        onClick={deploy}
        className="border rounded px-3 py-2 disabled:opacity-50"
      >
        {running ? 'Waiting for tool…' : 'Run deploy tool'}
      </button>
      {approval && (
        <div className="border rounded p-4 space-y-3">
          <p>{approval.message}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => answer('accept')}
              className="border rounded px-3 py-2"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => answer('decline')}
              className="border rounded px-3 py-2"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => answer('cancel')}
              className="border rounded px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <pre aria-live="polite" className="whitespace-pre-wrap">
        {output}
      </pre>
    </main>
  );
}
