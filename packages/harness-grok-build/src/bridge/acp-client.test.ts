import { describe, expect, it, vi } from 'vitest';
import { createAcpClient } from './acp-client';

function setup() {
  const lines: string[] = [];
  const client = createAcpClient({ writeLine: line => lines.push(line) });
  const parsed = () => lines.map(l => JSON.parse(l));
  return { lines, parsed, client };
}

describe('createAcpClient', () => {
  it('writes a correctly-shaped request line with incrementing ids', () => {
    const { parsed, client } = setup();
    void client.request('initialize', { a: 1 });
    void client.request('session/new');
    expect(parsed()).toEqual([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { a: 1 } },
      { jsonrpc: '2.0', id: 2, method: 'session/new', params: undefined },
    ]);
  });

  it('resolves a request when a matching id+result line is fed', async () => {
    const { client } = setup();
    const p = client.request('session/new');
    client.handleLine(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }),
    );
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('rejects a request on a matching id+error line', async () => {
    const { client } = setup();
    const p = client.request('boom');
    client.handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -1, message: 'no' },
      }),
    );
    await expect(p).rejects.toEqual({ code: -1, message: 'no' });
  });

  it('notify writes a line with no id', () => {
    const { parsed, client } = setup();
    client.notify('session/update', { x: 1 });
    expect(parsed()).toEqual([
      { jsonrpc: '2.0', method: 'session/update', params: { x: 1 } },
    ]);
    expect('id' in parsed()[0]).toBe(false);
  });

  it('fires a registered notification handler', () => {
    const { client } = setup();
    const cb = vi.fn();
    client.onNotification('session/update', cb);
    client.handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: { y: 2 },
      }),
    );
    expect(cb).toHaveBeenCalledWith({ y: 2 });
  });

  it('fires a request handler and writes back its result', async () => {
    const { parsed, client } = setup();
    client.onRequest('session/request_permission', () => ({
      outcome: 'allow',
    }));
    client.handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'session/request_permission',
      }),
    );
    await vi.waitFor(() =>
      expect(parsed()).toEqual([
        { jsonrpc: '2.0', id: 7, result: { outcome: 'allow' } },
      ]),
    );
  });

  it('writes an error response when a request handler throws', async () => {
    const { parsed, client } = setup();
    client.onRequest('fs/read_text_file', () => {
      throw new Error('nope');
    });
    client.handleLine(
      JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'fs/read_text_file' }),
    );
    await vi.waitFor(() => {
      expect(parsed()[0].id).toBe(9);
      expect(parsed()[0].error.message).toContain('nope');
    });
  });

  it('replies with method-not-found for an unknown inbound request', () => {
    const { parsed, client } = setup();
    client.handleLine(
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'mystery/method' }),
    );
    expect(parsed()).toEqual([
      {
        jsonrpc: '2.0',
        id: 3,
        error: { code: -32601, message: 'Method not found' },
      },
    ]);
  });

  it('ignores unknown notifications and malformed lines without throwing', () => {
    const { lines, client } = setup();
    expect(() => client.handleLine('not json {')).not.toThrow();
    expect(() =>
      client.handleLine(
        JSON.stringify({ jsonrpc: '2.0', method: 'unknown/x' }),
      ),
    ).not.toThrow();
    expect(lines).toEqual([]);
  });
});
