import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpExchange, HttpFixture } from './http-fixture';
import {
  createRecordingHandler,
  createReplayHandler,
} from './record-replay-handler';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

function tempFixturePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-e2e-'));
  return join(dir, 'fixture.json');
}

function writeFixture(
  path: string,
  exchanges: HttpExchange[],
  description = 'claude-code basic',
): void {
  const fixture: HttpFixture = {
    version: 1,
    description,
    recordedAt: '2026-01-01T00:00:00.000Z',
    exchanges,
  };
  writeFileSync(path, JSON.stringify(fixture, null, 2));
}

function messagesExchange(value: unknown, responseText = 'OK'): HttpExchange {
  return {
    request: {
      method: 'POST',
      url: MESSAGES_URL,
      headers: { 'content-type': 'application/json' },
      body: { type: 'json', value },
    },
    response: {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: { type: 'text', value: responseText },
    },
  };
}

function postMessages(value: unknown): Request {
  return new Request(MESSAGES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('record → replay round-trip', () => {
  it('captures a live exchange and replays it offline', async () => {
    const path = tempFixturePath();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('hello from network', {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          }),
      ),
    );

    const recorder = createRecordingHandler(path, 'claude-code basic');
    const recorded = await recorder.handler(
      postMessages({ model: 'm', messages: [] }),
    );
    expect(await recorded.text()).toBe('hello from network');
    await recorder.save();

    const written = JSON.parse(readFileSync(path, 'utf8')) as HttpFixture;
    expect(written.version).toBe(1);
    expect(written.exchanges).toHaveLength(1);

    const replay = createReplayHandler(path);
    const replayed = await replay.handler(
      postMessages({ model: 'm', messages: [] }),
    );
    expect(await replayed.text()).toBe('hello from network');
    expect(replay.lastMatchMode).toBe('exact');
  });
});

describe('4-tier matcher', () => {
  const recordedValue = {
    model: 'm',
    messages: [{ role: 'user', content: 'Capital of France?' }],
  };

  it('matches exactly on identical body', async () => {
    const path = tempFixturePath();
    writeFixture(path, [messagesExchange(recordedValue)]);
    const replay = createReplayHandler(path);
    await replay.handler(postMessages(recordedValue));
    expect(replay.lastMatchMode).toBe('exact');
  });

  it('falls back to canonical on key reorder', async () => {
    const path = tempFixturePath();
    writeFixture(path, [messagesExchange(recordedValue)]);
    const replay = createReplayHandler(path);
    await replay.handler(
      postMessages({
        messages: [{ content: 'Capital of France?', role: 'user' }],
        model: 'm',
      }),
    );
    expect(replay.lastMatchMode).toBe('canonical');
  });

  it('falls back to semantic when a non-message field differs', async () => {
    const path = tempFixturePath();
    writeFixture(path, [messagesExchange(recordedValue)]);
    const replay = createReplayHandler(path);
    await replay.handler(postMessages({ ...recordedValue, temperature: 0.7 }));
    expect(replay.lastMatchMode).toBe('semantic');
  });

  it('falls back to first-turn when later turns differ', async () => {
    const path = tempFixturePath();
    writeFixture(path, [messagesExchange(recordedValue)]);
    const replay = createReplayHandler(path);
    await replay.handler(
      postMessages({
        model: 'm',
        messages: [
          { role: 'user', content: 'Capital of France?' },
          { role: 'assistant', content: 'Paris.' },
          { role: 'user', content: 'And of Spain?' },
        ],
      }),
    );
    expect(replay.lastMatchMode).toBe('first-turn');
  });
});

describe('synthetic route policies', () => {
  it('short-circuits the MCP registry without consuming a fixture', async () => {
    const path = tempFixturePath();
    writeFixture(path, []);
    const replay = createReplayHandler(path);
    const res = await replay.handler(
      new Request('https://api.anthropic.com/mcp-registry/v0/servers'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ servers: [], metadata: { count: 0 } });
    expect(replay.exchangesReplayed).toBe(0);
  });

  it('synthesizes a 401 for the credential probe', async () => {
    const path = tempFixturePath();
    writeFixture(path, []);
    const replay = createReplayHandler(path);
    const res = await replay.handler(
      new Request(
        'https://api.anthropic.com/api/claude_code/organizations/metrics_enabled',
      ),
    );
    expect(res.status).toBe(401);
  });
});

describe('miss diagnostics', () => {
  it('throws with a re-record command on no match', async () => {
    const path = tempFixturePath();
    writeFixture(path, [
      messagesExchange({
        model: 'm',
        messages: [{ role: 'user', content: 'Capital of France?' }],
      }),
    ]);
    const replay = createReplayHandler(path);
    await expect(
      replay.handler(
        postMessages({
          model: 'm',
          messages: [{ role: 'user', content: 'totally unrelated prompt' }],
        }),
      ),
    ).rejects.toThrow(/Replay miss[\s\S]*Re-record command/);
  });
});
