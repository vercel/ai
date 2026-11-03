import { execFile } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { promisify } from 'node:util';
import { describe, expect, test, vi } from 'vitest';
import { ToolRelayAuthorizer } from './tool-relay-auth';
import { startAuthorizedToolRelay } from './tool-relay';

const execFileAsync = promisify(execFile);

describe('startAuthorizedToolRelay', () => {
  test('rejects a request from a process containing the MCP helper path', async () => {
    const emit = vi.fn();
    const requestToolResult = vi.fn(async () => ({
      output: { leaked: 'HOST_TOOL_SECRET' },
    }));
    const relay = await startAuthorizedToolRelay({
      tools: [{ name: 'host_secret' }],
      emit,
      requestToolResult,
      authorizer: new ToolRelayAuthorizer({ ttlMs: 50 }),
    });

    try {
      const response = await requestFromProcessWithHelperPath({
        url: `http://127.0.0.1:${relay.port}`,
        helperPath: '/tmp/harness/opencode/host-tool-mcp.mjs',
        toolName: 'host_secret',
        input: { from: 'malicious-project-code' },
      });

      expect(response).toEqual({
        status: 401,
        body: { error: 'unauthorized tool relay request' },
      });
      expect(emit).not.toHaveBeenCalled();
      expect(requestToolResult).not.toHaveBeenCalled();
    } finally {
      relay.close();
    }
  });

  test('executes an exactly authorized tool call', async () => {
    const emit = vi.fn();
    const requestToolResult = vi.fn(async () => ({ output: { value: 42 } }));
    const relay = await startAuthorizedToolRelay({
      tools: [{ name: 'lookup' }],
      emit,
      requestToolResult,
    });
    const call = { toolName: 'lookup', input: { key: 'answer' } };

    try {
      relay.authorizeToolCall(call);
      const response = await fetch(`http://127.0.0.1:${relay.port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'authorized-call', ...call }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        result: { value: 42 },
      });
      expect(requestToolResult).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenCalledTimes(2);
    } finally {
      relay.close();
    }
  });

  test('returns the model-facing result and error flag alongside the raw output', async () => {
    const toolResult = {
      type: 'tool-result' as const,
      toolCallId: 'authorized-call',
      toolName: 'lookup',
      output: { type: 'text' as const, value: 'model text' },
    };
    const relay = await startAuthorizedToolRelay({
      tools: [{ name: 'lookup' }],
      emit: vi.fn(),
      requestToolResult: async () => ({
        output: { value: 42 },
        isError: false,
        toolResult,
      }),
    });
    const call = { toolName: 'lookup', input: {} };

    try {
      relay.authorizeToolCall(call);
      const response = await fetch(`http://127.0.0.1:${relay.port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'authorized-call', ...call }),
      });

      await expect(response.json()).resolves.toEqual({
        result: { value: 42 },
        isError: false,
        toolResult,
      });
    } finally {
      relay.close();
    }
  });

  test('rejects an oversized body before parsing or authorizing it', async () => {
    const emit = vi.fn();
    const requestToolResult = vi.fn(async () => ({ output: { value: 42 } }));
    const relay = await startAuthorizedToolRelay({
      tools: [{ name: 'lookup' }],
      emit,
      requestToolResult,
    });

    try {
      const body = JSON.stringify({
        requestId: 'oversized-call',
        toolName: 'lookup',
        input: { pad: 'a'.repeat(16 * 1024 * 1024) },
      });
      const response = await fetch(`http://127.0.0.1:${relay.port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toEqual({
        error: 'Tool relay request is too large.',
      });
      expect(emit).not.toHaveBeenCalled();
      expect(requestToolResult).not.toHaveBeenCalled();
    } finally {
      relay.close();
    }
  });

  test('rejects a streamed body that crosses the limit without a Content-Length', async () => {
    const emit = vi.fn();
    const requestToolResult = vi.fn(async () => ({ output: { value: 42 } }));
    const relay = await startAuthorizedToolRelay({
      tools: [{ name: 'lookup' }],
      emit,
      requestToolResult,
    });

    try {
      const response = await requestChunkedBodyPastLimit({
        url: `http://127.0.0.1:${relay.port}`,
        prefix:
          '{"requestId":"streamed-call","toolName":"lookup","input":{"pad":"',
      });

      expect(response).toEqual({
        status: 413,
        body: { error: 'Tool relay request is too large.' },
      });
      expect(emit).not.toHaveBeenCalled();
      expect(requestToolResult).not.toHaveBeenCalled();
    } finally {
      relay.close();
    }
  });
});

async function requestChunkedBodyPastLimit({
  url,
  prefix,
}: {
  url: string;
  prefix: string;
}): Promise<{ status: number; body: unknown }> {
  const limit = 16 * 1024 * 1024;
  const filler = Buffer.alloc(1024 * 1024, 0x61);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      response => {
        let body = '';
        response.on('data', chunk => (body += chunk.toString()));
        response.on('end', () => {
          req.destroy();
          resolve({
            status: response.statusCode ?? 0,
            body: body === '' ? null : JSON.parse(body),
          });
        });
      },
    );
    req.on('error', reject);
    req.write(prefix);
    let written = Buffer.byteLength(prefix);
    (function pump() {
      while (written < limit) {
        const size = Math.min(filler.length, limit - written);
        written += size;
        if (!req.write(filler.subarray(0, size))) {
          req.once('drain', pump);
          return;
        }
      }
      // Cross the limit by one byte and stop writing: the relay must reject
      // the stream instead of waiting for the rest of the body.
      req.write(Buffer.alloc(1, 0x61));
    })();
  });
}

async function requestFromProcessWithHelperPath({
  url,
  helperPath,
  toolName,
  input,
}: {
  url: string;
  helperPath: string;
  toolName: string;
  input: unknown;
}): Promise<{ status: number; body: unknown }> {
  const script = `
const response = await fetch(${JSON.stringify(url)}, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(${JSON.stringify({
    requestId: 'unauthorized-call',
    toolName,
    input,
  })}),
});
process.stdout.write(JSON.stringify({ status: response.status, body: await response.json() }));
`;
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', script, helperPath],
    { encoding: 'utf8' },
  );
  return JSON.parse(stdout) as { status: number; body: unknown };
}
