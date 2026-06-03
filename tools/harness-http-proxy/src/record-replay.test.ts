import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordingHandler, createReplayHandler } from './record-replay';

describe('record / replay', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-proxy-rr-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('records live exchanges, then replays them with zero network access', async () => {
    const file = join(dir, 'cassette.json');

    // --- record: forward to a stubbed network and capture ---
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const rec = createRecordingHandler(file);
    const recorded = await rec.handler(
      new Request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: '{"model":"x"}',
      }),
    );
    expect(await recorded.text()).toBe('{"ok":true}');
    expect(fetchSpy).toHaveBeenCalledOnce();
    rec.save();

    // --- replay: same request, but the network must never be hit ---
    fetchSpy.mockClear();
    const replay = createReplayHandler(file);
    const replayed = replay.handler(
      new Request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: '{"model":"x"}',
      }),
    );

    expect(replayed.status).toBe(200);
    expect(replayed.headers.get('content-type')).toBe('application/json');
    expect(await replayed.text()).toBe('{"ok":true}');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(replay.remaining).toBe(0);
  });

  it('throws a re-record-worthy error on a replay miss', () => {
    const file = join(dir, 'cassette.json');
    createRecordingHandler(file).save(); // empty cassette

    const replay = createReplayHandler(file);
    expect(() =>
      replay.handler(new Request('https://api.anthropic.com/v1/messages')),
    ).toThrow(/Replay miss for GET \/v1\/messages/);
  });
});
